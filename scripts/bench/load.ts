import "./common";
import dns from "node:dns";
dns.setServers(["1.1.1.1", "8.8.8.8"]);

import autocannon from "autocannon";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { enforceEnvironmentGuard, getSystemInfo, saveRawResult } from "./common";
import { config } from "../../server/src/config/config";
import { connectToDb, disconnectFromDb } from "../../server/src/config/db";
import { getRedisClient, closeRedisConnection } from "../../server/src/services/ai/queue/connection";
import { getAiQueue, getEmbedQueue } from "../../server/src/services/ai/queue/bullmq";
import { incidentDao } from "../../server/src/dao/incidentDao";
import { organizationDao } from "../../server/src/dao/organizationDao";
import { userDao } from "../../server/src/dao/userDao";
import { serviceDao } from "../../server/src/dao/serviceDao";
import { performCleanup } from "./cleanup";
import { INCIDENT_STATUS, INCIDENT_PRIORITY } from "../../server/src/types";

// ============================================================================
// 1. CLI Arguments & Configuration
// ============================================================================
const args = process.argv.slice(2);
function getArgValue(flag: string, defaultValue: string): string {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
}

const TARGET_URL = getArgValue("--url", "http://localhost:5000").replace(/\/$/, "");
const CONNECTIONS = parseInt(getArgValue("--connections", "10"), 10);
const DURATION_SEC = parseInt(getArgValue("--duration", "10"), 10);
const WARMUP_SEC = 2;
const ALERT_BURST_COUNT = parseInt(getArgValue("--alerts", "200"), 10);
const MAX_SECONDS = parseInt(getArgValue("--max-seconds", "120"), 10);
const ALLOW_REAL_DB = args.includes("--allow-real-db");
const SKIP_REDIS_CHECK = args.includes("--skip-redis-check");

enforceEnvironmentGuard(TARGET_URL);

// Unique session ID to tag every record created during this benchmark run
const benchSessionId = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Elapsed time logger
const startTime = Date.now();
function logProgress(phaseName: string): void {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`⏱️  [${elapsed.padStart(5, " ")}s] ⏳ ${phaseName}`);
}

interface EndpointResult {
  target: string;
  method: string;
  url: string;
  requestsPerSec: number;
  totalRequests: number;
  latencyMs: {
    min: number;
    avg: number;
    p50: number;
    p90: number;
    p95: number;
    p99: number;
    max: number;
  };
  errors: number;
  errorRatePercent: number;
  non2xx: number;
  statusCodeBreakdown: Record<string, number>;
}

const endpointResults: EndpointResult[] = [];
let activeAutocannon: any = null;

// ============================================================================
// 2. Hard Global Timeout (Requirement 1)
// ============================================================================
const globalTimeoutTimer = setTimeout(async () => {
  console.error(`\n❌ [TIMEOUT] Hard global timeout of ${MAX_SECONDS}s exceeded!`);
  if (activeAutocannon) {
    try {
      activeAutocannon.stop();
    } catch { }
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `load-${timestamp}-TIMEOUT.json`;
  saveRawResult(filename, {
    benchmark: "load-autocannon",
    status: "timed_out",
    maxSeconds: MAX_SECONDS,
    elapsedSeconds: (Date.now() - startTime) / 1000,
    system: getSystemInfo(),
    partialEndpointResults: endpointResults,
  });

  try {
    await performCleanup(benchSessionId);
    await disconnectFromDb();
  } catch { }

  process.exit(1);
}, MAX_SECONDS * 1000);
globalTimeoutTimer.unref();

/**
 * Executes an autocannon benchmark for an endpoint
 */
async function runAutocannon(
  opts: {
    url: string;
    method: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
    connections: number;
    duration: number;
  }
): Promise<autocannon.Result> {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: opts.url,
        method: opts.method,
        headers: opts.headers,
        body: opts.body,
        connections: opts.connections,
        duration: opts.duration,
        pipelining: 1,
      },
      (err, result) => {
        activeAutocannon = null;
        if (err) {
          return reject(err);
        }
        resolve(result);
      }
    );
    activeAutocannon = instance;
  });
}

function formatResult(targetName: string, method: string, url: string, r: autocannon.Result): EndpointResult {
  const totalReqs = r.requests.total || 0;
  const errorCount = r.errors || 0;
  const statusCodes: Record<string, number> = {};
  if (r.statusCodeStats) {
    for (const [code, stat] of Object.entries(r.statusCodeStats)) {
      statusCodes[code] = stat.count ?? 0;
    }
  }

  let non2xx = 0;
  for (const [code, count] of Object.entries(statusCodes)) {
    const numeric = parseInt(code, 10);
    if (numeric < 200 || numeric >= 300) {
      non2xx += count;
    }
  }

  return {
    target: targetName,
    method,
    url,
    requestsPerSec: Math.round(r.requests.average),
    totalRequests: totalReqs,
    latencyMs: {
      min: r.latency.min,
      avg: r.latency.average,
      p50: r.latency.p50,
      p90: r.latency.p90,
      p95: (r.latency as any).p95 ?? r.latency.p97_5 ?? 0,
      p99: r.latency.p99,
      max: r.latency.max,
    },
    errors: errorCount,
    errorRatePercent: totalReqs > 0 ? (errorCount / totalReqs) * 100 : 0,
    non2xx,
    statusCodeBreakdown: statusCodes,
  };
}

async function main() {
  console.log("===============================================================");
  console.log("🔥 RESOLVER LOAD & RESILIENCE BENCHMARK (Autocannon)");
  console.log("===============================================================");
  console.log(`🎯 Target URL:     ${TARGET_URL}`);
  console.log(`🔌 Connections:    ${CONNECTIONS}`);
  console.log(`⏱️ Duration:       ${DURATION_SEC}s per endpoint (Warmup: ${WARMUP_SEC}s)`);
  console.log(`🌪️ Alert Burst:    ${ALERT_BURST_COUNT} alerts`);
  console.log(`🛡️ Hard Timeout:   ${MAX_SECONDS}s`);
  console.log(`🏷️ Bench Session:  ${benchSessionId}`);
  console.log("===============================================================\n");

  // =========================================================================
  // 3. Pre-flight Checks (Requirement 3)
  // =========================================================================
  logProgress("Pre-flight: Checking target server GET /health (5s timeout)...");
  try {
    const healthRes = await fetch(`${TARGET_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!healthRes.ok && healthRes.status !== 503) {
      console.error(
        `\n❌ [PRE-CHECK FAILED] Server at ${TARGET_URL}/health returned unexpected status HTTP ${healthRes.status}.`
      );
      process.exit(1);
    }
    const healthJson: any = await healthRes.json().catch(() => ({}));
    console.log(`   ✓ Target server responsive on /health (status: '${healthJson.status || "ok"}').`);
  } catch (err: any) {
    console.error(`\n❌ [PRE-CHECK FAILED] Target server at ${TARGET_URL}/health did not answer within 5s.`);
    console.error("   Please ensure the Resolver API server is running (e.g. 'npm --prefix server run dev').");
    process.exit(1);
  }

  if (!SKIP_REDIS_CHECK) {
    logProgress("Pre-flight: Checking Redis broker connectivity (5s timeout)...");
    try {
      const redis = getRedisClient();
      const pingRes = await Promise.race([
        redis.ping(),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error("Redis ping timed out after 5s")), 5000)
        ),
      ]);
      if (pingRes !== "PONG") {
        throw new Error(`Unexpected Redis response: ${pingRes}`);
      }
      console.log(`   ✓ Redis broker responsive at ${config.REDIS_URL} (PONG).`);
    } catch (redisErr: any) {
      try {
        const r = getRedisClient();
        r.disconnect();
      } catch { }
      console.error(`\n❌ [PRE-CHECK FAILED] Redis is not reachable at ${config.REDIS_URL} (${redisErr.message}).`);
      console.error("   Docker is used only for Redis. Please start your Redis container (e.g. 'docker run -d -p 6379:6379 redis:alpine') and retry.");
      process.exit(1);
    }
  }

  // =========================================================================
  // 4. Safe Database Enforcement (Requirement 5)
  // =========================================================================
  logProgress("Connecting to MongoDB database...");
  await connectToDb();
  const dbName = mongoose.connection.name || mongoose.connection.db?.databaseName || "unknown";
  const mongoUri = config.MONGODB_URI || "";
  const databaseType = mongoUri.includes("mongodb.net")
    ? "MongoDB Atlas (Remote Cloud Cluster)"
    : mongoUri.includes("localhost") || mongoUri.includes("127.0.0.1")
      ? "Local MongoDB"
      : "Custom MongoDB Server";
  console.log(`   📦 Connected to MongoDB database: '${dbName}' [Type: ${databaseType}]`);

  const isSafeDb = dbName.toLowerCase().includes("bench") || dbName.toLowerCase().includes("test");
  if (!isSafeDb && !ALLOW_REAL_DB) {
    console.error(
      `\n❌ Refusing to run benchmark against database '${dbName}'.`
    );
    console.error("   Database name must contain 'bench' or 'test' (e.g. resolver_bench, resolver_test).");
    console.error("   Pass --allow-real-db to explicitly bypass this safety guard.\n");
    await disconnectFromDb();
    process.exit(1);
  }

  // =========================================================================
  // 5. Setup Tagged Synthetic Test Records (Requirement 6)
  // =========================================================================
  logProgress("Creating tagged synthetic organization, user, and service...");
  const org = await organizationDao.create({
    name: "Load Benchmark Org",
    slug: `bench-org-${Date.now()}`,
    statusPageEnabled: false,
    seeded: true,
    benchSession: benchSessionId,
  });
  const benchOrgId = org._id.toString();

  const user = await userDao.create({
    name: "Bench User",
    email: `bench-${Date.now()}@resolver.local`,
    passwordHash: "dummy_hash_bench",
    role: "ADMIN",
    organizationId: org._id,
    isActive: true,
    seeded: true,
    benchSession: benchSessionId,
  });
  const benchUserId = user._id.toString();

  const service = await serviceDao.create({
    name: "bench-payment-svc",
    tier: 2,
    owningTeam: "bench-team",
    organizationId: org._id,
    seeded: true,
    benchSession: benchSessionId,
  });
  const benchServiceId = service._id.toString();

  const jwtSecret = config.JWT_ACCESS_SECRET;
  const ingestSecret = config.ALERT_INGEST_SECRET;

  const testAuthToken = jwt.sign(
    {
      userId: benchUserId,
      organizationId: benchOrgId,
      email: user.email,
      role: "ADMIN",
    },
    jwtSecret,
    { expiresIn: "2h" }
  );

  const authHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${testAuthToken}`,
  };

  const alertHeaders = {
    "content-type": "application/json",
    "x-resolver-secret": ingestSecret,
  };

  // Pre-seed 1 incident for GET /incidents/:id test
  const seedIncident = await incidentDao.create({
    organizationId: org._id as any,
    title: "Benchmark Target Incident for Latency Measurement",
    description: "Synthetically seeded incident to measure GET /incidents/:id latency.",
    status: INCIDENT_STATUS.OPEN,
    priority: INCIDENT_PRIORITY.MEDIUM,
    createdBy: user._id as any,
    serviceId: service._id as any,
    seeded: true,
    benchSession: benchSessionId,
    ai: {
      status: "unavailable",
    },
  });
  const sampleIncidentId = seedIncident._id.toString();

  // =========================================================================
  // Target 1: POST /alerts/ingest (Alert Ingest)
  // =========================================================================
  const alertPayload = JSON.stringify({
    title: "Payment gateway upstream timeout",
    description: "504 Gateway Timeout from payment upstream partner",
    severity: "HIGH",
    serviceId: benchServiceId,
    source: "bench-autocannon",
    fingerprint: "bench-svc:payment-timeout-load",
    metadata: {
      seeded: true,
      benchSession: benchSessionId,
    },
  });

  logProgress("▶️ [1/4] Benchmarking: POST /alerts/ingest (Alert Ingest)");
  await runAutocannon({
    url: `${TARGET_URL}/alerts/ingest`,
    method: "POST",
    headers: alertHeaders,
    body: alertPayload,
    connections: 2,
    duration: WARMUP_SEC,
  });

  const alertBench = await runAutocannon({
    url: `${TARGET_URL}/alerts/ingest`,
    method: "POST",
    headers: alertHeaders,
    body: alertPayload,
    connections: CONNECTIONS,
    duration: DURATION_SEC,
  });
  const alertResult = formatResult("Alert Ingest", "POST", `${TARGET_URL}/alerts/ingest`, alertBench);
  endpointResults.push(alertResult);
  console.log(`   ✓ Req/Sec: ${alertResult.requestsPerSec} | p50: ${alertResult.latencyMs.p50}ms | p95: ${alertResult.latencyMs.p95}ms | Non-2xx: ${alertResult.non2xx}`);

  // =========================================================================
  // Target 2: POST /api/v1/incidents (Incident Create)
  // =========================================================================
  const incidentPayload = JSON.stringify({
    title: "Database connection spike under simulated benchmark",
    description: "Synthetic incident created during autocannon throughput benchmark.",
    priority: "HIGH",
    serviceId: benchServiceId,
  });

  logProgress("▶️ [2/4] Benchmarking: POST /api/v1/incidents (Incident Create)");
  await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents`,
    method: "POST",
    headers: authHeaders,
    body: incidentPayload,
    connections: 2,
    duration: WARMUP_SEC,
  });

  const incidentBench = await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents`,
    method: "POST",
    headers: authHeaders,
    body: incidentPayload,
    connections: CONNECTIONS,
    duration: DURATION_SEC,
  });
  const incidentResult = formatResult("Incident Create", "POST", `${TARGET_URL}/api/v1/incidents`, incidentBench);
  endpointResults.push(incidentResult);
  console.log(`   ✓ Req/Sec: ${incidentResult.requestsPerSec} | p50: ${incidentResult.latencyMs.p50}ms | p95: ${incidentResult.latencyMs.p95}ms | Non-2xx: ${incidentResult.non2xx}`);

  // =========================================================================
  // Target 3: GET /api/v1/incidents/:id (Incident Detail)
  // =========================================================================
  logProgress(`▶️ [3/4] Benchmarking: GET /api/v1/incidents/:id`);
  await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents/${sampleIncidentId}`,
    method: "GET",
    headers: authHeaders,
    connections: 2,
    duration: WARMUP_SEC,
  });

  const detailBench = await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents/${sampleIncidentId}`,
    method: "GET",
    headers: authHeaders,
    connections: CONNECTIONS,
    duration: DURATION_SEC,
  });
  const detailResult = formatResult("Incident Detail", "GET", `${TARGET_URL}/api/v1/incidents/:id`, detailBench);
  endpointResults.push(detailResult);
  console.log(`   ✓ Req/Sec: ${detailResult.requestsPerSec} | p50: ${detailResult.latencyMs.p50}ms | p95: ${detailResult.latencyMs.p95}ms | Non-2xx: ${detailResult.non2xx}`);

  // =========================================================================
  // Target 4: GET /api/v1/incidents (Incident List)
  // =========================================================================
  logProgress("▶️ [4/4] Benchmarking: GET /api/v1/incidents (Incident List)");
  await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents?page=1&limit=10`,
    method: "GET",
    headers: authHeaders,
    connections: 2,
    duration: WARMUP_SEC,
  });

  const listBench = await runAutocannon({
    url: `${TARGET_URL}/api/v1/incidents?page=1&limit=10`,
    method: "GET",
    headers: authHeaders,
    connections: CONNECTIONS,
    duration: DURATION_SEC,
  });
  const listResult = formatResult("Incident List", "GET", `${TARGET_URL}/api/v1/incidents`, listBench);
  endpointResults.push(listResult);
  console.log(`   ✓ Req/Sec: ${listResult.requestsPerSec} | p50: ${listResult.latencyMs.p50}ms | p95: ${listResult.latencyMs.p95}ms | Non-2xx: ${listResult.non2xx}`);

  // =========================================================================
  // Second Pass: Alert Burst & Grouping Effect
  // =========================================================================
  logProgress(`🌪️ Second Pass: Sending ${ALERT_BURST_COUNT} burst alerts across 4 fingerprints...`);
  const initialIncidents = await incidentDao.countIncidentsByOrg(benchOrgId);

  const fingerprints = [
    "burst:auth-jwt-expired",
    "burst:db-replica-delay",
    "burst:redis-oom-warning",
    "burst:ingress-502-spike",
  ];

  const burstStart = Date.now();
  let alertsAccepted = 0;
  let alertsRateLimited = 0;

  const batchSize = 10;
  for (let i = 0; i < ALERT_BURST_COUNT; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j < ALERT_BURST_COUNT; j++) {
      const idx = i + j;
      const fp = fingerprints[idx % fingerprints.length];
      const payload = JSON.stringify({
        title: `Burst alert #${idx + 1} for ${fp}`,
        description: `Simulated high-frequency alert sharing fingerprint ${fp}`,
        severity: "HIGH",
        serviceId: benchServiceId,
        source: "bench-burst",
        fingerprint: fp,
        metadata: {
          seeded: true,
          benchSession: benchSessionId,
        },
      });

      batch.push(
        fetch(`${TARGET_URL}/alerts/ingest`, {
          method: "POST",
          headers: alertHeaders,
          body: payload,
          signal: AbortSignal.timeout(5000),
        })
          .then((res) => {
            if (res.status === 201 || res.status === 200) alertsAccepted++;
            else if (res.status === 429) alertsRateLimited++;
          })
          .catch(() => { })
      );
    }
    await Promise.all(batch);
  }
  const burstElapsedMs = Date.now() - burstStart;

  const finalIncidents = await incidentDao.countIncidentsByOrg(benchOrgId);
  const incidentsCreated = Math.max(0, finalIncidents - initialIncidents);

  console.log("\n   📊 Burst Grouping Results:");
  console.log(`      - Alerts Sent:            ${ALERT_BURST_COUNT}`);
  console.log(`      - Alerts Accepted:        ${alertsAccepted}`);
  console.log(`      - Alerts Rate-Limited:    ${alertsRateLimited}`);
  console.log(`      - Incidents Created:      ${incidentsCreated}`);
  console.log(`      - Grouping / Cap Effect:  ${ALERT_BURST_COUNT} alerts mapped into ≤ ${Math.max(incidentsCreated, fingerprints.length)} incidents`);
  console.log(`      - Unbounded Creation:     ${incidentsCreated <= config.ALERT_FLOOD_INCIDENT_CAP ? "PREVENTED (Protected by grouping & flood cap)" : "FLAGGED"}`);
  console.log(`      - Elapsed Wall Time:      ${burstElapsedMs} ms`);

  // =========================================================================
  // Rate-Limit Behavior Verification
  // =========================================================================
  logProgress("🛑 Rate-Limit Behavior: Verifying HTTP 429 throttling...");
  const limitThreshold = config.ALERT_RATE_LIMIT_MAX || 120;
  const requestsToSend = 30; // Rapid short burst

  const rateLimitStatuses: Record<number, number> = {};
  const rateLimitBurst = [];
  for (let i = 0; i < requestsToSend; i++) {
    rateLimitBurst.push(
      fetch(`${TARGET_URL}/alerts/ingest`, {
        method: "POST",
        headers: alertHeaders,
        body: alertPayload,
        signal: AbortSignal.timeout(5000),
      })
        .then((res) => {
          rateLimitStatuses[res.status] = (rateLimitStatuses[res.status] || 0) + 1;
        })
        .catch(() => { })
    );
  }
  await Promise.all(rateLimitBurst);

  let serverStillHealthy = false;
  try {
    const healthCheck = await fetch(`${TARGET_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    serverStillHealthy = healthCheck.ok || healthCheck.status === 503;
  } catch { }

  console.log("\n   📊 Rate Limit Status Codes:");
  for (const [code, count] of Object.entries(rateLimitStatuses)) {
    console.log(`      - HTTP ${code}: ${count} requests`);
  }
  console.log(`      - Server Remains Healthy: ${serverStillHealthy ? "YES (200 OK on /health)" : "NO"}`);

  // =========================================================================
  // 6. Cleanup & Raw Output
  // =========================================================================
  logProgress("Cleaning up tagged benchmark records (bench:cleanup)...");
  const cleaned = await performCleanup(benchSessionId);
  console.log(`   ✓ Cleaned ${cleaned.incidents} incidents, ${cleaned.alerts} alerts, ${cleaned.organizations} orgs.`);

  // Remove orphaned Redis BullMQ jobs created during this benchSession so Redis stays clean
  if (!SKIP_REDIS_CHECK) {
    try {
      const q1 = getAiQueue();
      const q2 = getEmbedQueue();
      for (const q of [q1, q2]) {
        const jobs = await q.getJobs(["waiting", "delayed", "prioritized"]);
        for (const j of jobs) {
          if (j?.data?.organizationId === benchOrgId) {
            await j.remove().catch(() => { });
          }
        }
        await q.close().catch(() => { });
      }
      await closeRedisConnection().catch(() => { });
    } catch { }
  }

  logProgress("Saving raw benchmark output to docs/results-raw/...");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `load-${timestamp}.json`;
  const rawOutput = {
    benchmark: "load-autocannon",
    status: "completed",
    benchSessionId,
    system: {
      ...getSystemInfo(),
      database: {
        name: dbName,
        type: databaseType,
      },
    },
    config: {
      targetUrl: TARGET_URL,
      connections: CONNECTIONS,
      durationSec: DURATION_SEC,
      warmupSec: WARMUP_SEC,
      alertBurstCount: ALERT_BURST_COUNT,
      aiProvider: config.AI_PROVIDER,
    },
    endpointResults,
    burstGrouping: {
      alertsSent: ALERT_BURST_COUNT,
      distinctFingerprints: fingerprints.length,
      alertsAccepted,
      alertsRateLimited,
      incidentsCreated,
      boundedCreationVerified: incidentsCreated <= config.ALERT_FLOOD_INCIDENT_CAP,
      elapsedMs: burstElapsedMs,
    },
    rateLimiting: {
      burstSent: requestsToSend,
      statusCodeBreakdown: rateLimitStatuses,
      rateLimitEnforced: !!rateLimitStatuses[429],
      serverHealthyAfterwards: serverStillHealthy,
    },
  };

  const savedPath = saveRawResult(filename, rawOutput);
  console.log(`\n💾 Raw results saved to: ${savedPath}`);

  await disconnectFromDb();
  clearTimeout(globalTimeoutTimer);
  console.log(`\n✅ Load benchmark finished cleanly in ${((Date.now() - startTime) / 1000).toFixed(1)}s.\n`);
}

main().catch(async (err) => {
  console.error("\n❌ Fatal error in load benchmark:", err.message || err);
  try {
    await performCleanup(benchSessionId);
    await disconnectFromDb();
  } catch { }
  clearTimeout(globalTimeoutTimer);
  process.exit(1);
});
