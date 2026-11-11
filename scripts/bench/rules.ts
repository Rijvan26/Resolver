import path from "path";
import { enforceEnvironmentGuard, getSystemInfo, saveRawResult } from "./common";
import { severityFromRules } from "../../server/src/services/ai/rulesEngine";

enforceEnvironmentGuard();

const EVALUATION_COUNT = 100_000;
const WARMUP_COUNT = 5_000;

// Deterministic test cases representing all branches of the rules engine
const testCases = [
  // 1. Tier 1 service down -> Rule 1 (P1, Tier-1 Safeguard)
  {
    name: "Tier 1 down",
    service: { tier: 1, name: "payment-gateway" },
    alert: { type: "down", title: "Payment service is down", description: "Service is unreachable" },
    expectedSeverity: "P1",
    expectedTier1: true,
  },
  // 2. Tier 1 service high error rate (8.5%) -> Rule 2 (P2, Tier-1 Safeguard)
  {
    name: "Tier 1 high error rate",
    service: { tier: 1, name: "auth-service" },
    alert: { type: "error", title: "High 5xx errors", description: "Error rate at 8.5%", errorRate: 8.5 },
    expectedSeverity: "P2",
    expectedTier1: true,
  },
  // 3. Tier 2 service down -> Rule 3 (P2)
  {
    name: "Tier 2 down",
    service: { tier: 2, name: "reporting-worker" },
    alert: { type: "down", title: "Worker unresponsive", description: "Queue consumer down" },
    expectedSeverity: "P2",
    expectedTier1: false,
  },
  // 4. Tier 3 service any alert -> Rule 4 (P4)
  {
    name: "Tier 3 default",
    service: { tier: 3, name: "analytics-collector" },
    alert: { type: "latency", title: "Buffer full", description: "Batch delayed by 5m" },
    expectedSeverity: "P4",
    expectedTier1: false,
  },
  // 5. Inconclusive: Tier 2 with mild latency (falls through to AI triage)
  {
    name: "Tier 2 inconclusive",
    service: { tier: 2, name: "notification-dispatcher" },
    alert: { type: "latency", title: "High memory usage", description: "Memory above 80%", errorRate: 1.2 },
    expectedSeverity: null,
    expectedTier1: false,
  },
  // 6. Inconclusive: Missing or untiered service
  {
    name: "Untiered service",
    service: null,
    alert: { type: "generic", title: "Generic host alert", description: "Disk space 90%" },
    expectedSeverity: null,
    expectedTier1: false,
  },
];

console.log("===============================================================");
console.log("⚡ RESOLVER MICRO-BENCHMARK: severityFromRules (100k evaluations)");
console.log("===============================================================");

// 1. Warm-up run (discarded)
console.log(`\n⏳ Warming up V8 JIT with ${WARMUP_COUNT.toLocaleString()} iterations...`);
for (let i = 0; i < WARMUP_COUNT; i++) {
  const tc = testCases[i % testCases.length];
  severityFromRules({ service: tc.service, alert: tc.alert });
}
console.log("✅ Warm-up complete.");

// 2. Benchmark run with high-resolution timing
console.log(`🚀 Executing ${EVALUATION_COUNT.toLocaleString()} evaluations...`);
const latenciesMs = new Float64Array(EVALUATION_COUNT);

let correctDecisions = 0;
const overallStart = process.hrtime.bigint();

for (let i = 0; i < EVALUATION_COUNT; i++) {
  const tc = testCases[i % testCases.length];
  const iterStart = process.hrtime.bigint();
  const result = severityFromRules({ service: tc.service, alert: tc.alert });
  const iterEnd = process.hrtime.bigint();

  latenciesMs[i] = Number(iterEnd - iterStart) / 1_000_000;

  // Correctness verification
  const matchesSeverity = (result?.severity || null) === tc.expectedSeverity;
  const matchesTier1 = (result?.isTier1Rule || false) === tc.expectedTier1;
  if (matchesSeverity && matchesTier1) {
    correctDecisions++;
  }
}

const overallEnd = process.hrtime.bigint();
const totalWallTimeMs = Number(overallEnd - overallStart) / 1_000_000;

// 3. Statistical Analysis
latenciesMs.sort();

const getPercentile = (sortedArr: Float64Array, p: number): number => {
  const index = Math.floor((p / 100) * sortedArr.length);
  return sortedArr[Math.min(index, sortedArr.length - 1)];
};

const minMs = latenciesMs[0];
const maxMs = latenciesMs[latenciesMs.length - 1];
const p50Ms = getPercentile(latenciesMs, 50);
const p90Ms = getPercentile(latenciesMs, 90);
const p95Ms = getPercentile(latenciesMs, 95);
const p99Ms = getPercentile(latenciesMs, 99);
let sumMs = 0;
for (let i = 0; i < latenciesMs.length; i++) {
  sumMs += latenciesMs[i];
}
const avgMs = sumMs / EVALUATION_COUNT;
const opsPerSec = Math.round((EVALUATION_COUNT / (totalWallTimeMs / 1000)));

console.log("\n📊 BENCHMARK RESULTS:");
console.log(`   - Evaluations:     ${EVALUATION_COUNT.toLocaleString()}`);
console.log(`   - Total Wall Time: ${totalWallTimeMs.toFixed(2)} ms`);
console.log(`   - Throughput:      ${opsPerSec.toLocaleString()} evals/sec`);
console.log(`   - Correctness:     ${((correctDecisions / EVALUATION_COUNT) * 100).toFixed(2)}% (${correctDecisions}/${EVALUATION_COUNT})`);
console.log(`   - Latency Min:     ${(minMs * 1000).toFixed(2)} µs (${minMs.toFixed(5)} ms)`);
console.log(`   - Latency Avg:     ${(avgMs * 1000).toFixed(2)} µs (${avgMs.toFixed(5)} ms)`);
console.log(`   - Latency p50:     ${(p50Ms * 1000).toFixed(2)} µs (${p50Ms.toFixed(5)} ms)`);
console.log(`   - Latency p90:     ${(p90Ms * 1000).toFixed(2)} µs (${p90Ms.toFixed(5)} ms)`);
console.log(`   - Latency p95:     ${(p95Ms * 1000).toFixed(2)} µs (${p95Ms.toFixed(5)} ms)`);
console.log(`   - Latency p99:     ${(p99Ms * 1000).toFixed(2)} µs (${p99Ms.toFixed(5)} ms)`);
console.log(`   - Latency Max:     ${(maxMs * 1000).toFixed(2)} µs (${maxMs.toFixed(5)} ms)`);

// 4. Save Raw Results
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `rules-${timestamp}.json`;
const rawOutput = {
  benchmark: "severityFromRules",
  system: getSystemInfo(),
  config: {
    evaluations: EVALUATION_COUNT,
    warmup: WARMUP_COUNT,
    network: false,
  },
  metrics: {
    totalWallTimeMs,
    throughputOpsSec: opsPerSec,
    correctnessPercent: (correctDecisions / EVALUATION_COUNT) * 100,
    latencyMs: {
      min: minMs,
      avg: avgMs,
      p50: p50Ms,
      p90: p90Ms,
      p95: p95Ms,
      p99: p99Ms,
      max: maxMs,
    },
    latencyUs: {
      min: minMs * 1000,
      avg: avgMs * 1000,
      p50: p50Ms * 1000,
      p90: p90Ms * 1000,
      p95: p95Ms * 1000,
      p99: p99Ms * 1000,
      max: maxMs * 1000,
    },
  },
};

const savedPath = saveRawResult(filename, rawOutput);
console.log(`\n💾 Raw results saved to: ${savedPath}`);
