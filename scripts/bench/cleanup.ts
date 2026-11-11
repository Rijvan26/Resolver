import "./common";
import dns from "node:dns";
dns.setServers(["1.1.1.1", "8.8.8.8"]);

import mongoose from "mongoose";
import { enforceEnvironmentGuard } from "./common";
import { connectToDb, disconnectFromDb } from "../../server/src/config/db";
import { Incident } from "../../server/src/models/Incident";
import { Alert } from "../../server/src/models/Alert";
import { Service } from "../../server/src/models/Service";
import { User } from "../../server/src/models/User";
import { Organization } from "../../server/src/models/Organization";
import { AiSuggestion } from "../../server/src/models/AiSuggestion";
import { Activity } from "../../server/src/models/Activity";
import { IncidentEmbedding } from "../../server/src/models/IncidentEmbedding";

enforceEnvironmentGuard();

const args = process.argv.slice(2);
function getArgValue(flag: string): string | null {
  const index = args.indexOf(flag);
  return index !== -1 && args[index + 1] ? args[index + 1] : null;
}

const targetSession = getArgValue("--session");
const allowRealDb = args.includes("--allow-real-db");

export async function performCleanup(sessionId?: string | null): Promise<Record<string, number>> {
  const filter: Record<string, unknown> = sessionId
    ? { benchSession: sessionId }
    : {
        $or: [
          { seeded: true },
          { benchSession: { $exists: true, $ne: null } },
          { "metadata.benchSession": { $exists: true, $ne: null } },
          { slug: { $regex: /^bench-org-/ } },
          { email: { $regex: /@resolver\.local$/ } },
        ],
      };

  const alertFilter: Record<string, unknown> = sessionId
    ? { $or: [{ benchSession: sessionId }, { "metadata.benchSession": sessionId }] }
    : {
        $or: [
          { seeded: true },
          { benchSession: { $exists: true, $ne: null } },
          { "metadata.benchSession": { $exists: true, $ne: null } },
          { source: { $regex: /^bench-/ } },
          { fingerprint: { $regex: /^bench-|^burst:/ } },
        ],
      };

  // Find target organizations first (both direct session match & orgs matching seeded filter)
  const targetOrgs = await Organization.find(filter).select("_id").lean();
  const orgIdSet = new Set<string>(targetOrgs.map((o: any) => String(o._id)));

  // In full cleanup mode without sessionId, also discover any orphaned orgIds from benchmark Incidents/Services/Users
  if (!sessionId) {
    const [incOrgs, svcOrgs, usrOrgs] = await Promise.all([
      Incident.distinct("organizationId", filter),
      Service.distinct("organizationId", filter),
      User.distinct("organizationId", filter),
    ]);
    for (const id of [...incOrgs, ...svcOrgs, ...usrOrgs]) {
      if (id) orgIdSet.add(String(id));
    }
  }

  const targetOrgIds = Array.from(orgIdSet);

  const incFilter =
    targetOrgIds.length > 0 ? { $or: [filter, { organizationId: { $in: targetOrgIds } }] } : filter;
  const fullAlertFilter =
    targetOrgIds.length > 0 ? { $or: [alertFilter, { organizationId: { $in: targetOrgIds } }] } : alertFilter;

  const [incidents, alerts, services, users, orgs, suggestions, activities, embeddings] = await Promise.all([
    Incident.deleteMany(incFilter),
    Alert.deleteMany(fullAlertFilter),
    Service.deleteMany(incFilter),
    User.deleteMany(incFilter),
    Organization.deleteMany(targetOrgIds.length > 0 ? { $or: [filter, { _id: { $in: targetOrgIds } }] } : filter),
    targetOrgIds.length > 0
      ? AiSuggestion.deleteMany({ organizationId: { $in: targetOrgIds } })
      : Promise.resolve({ deletedCount: 0 }),
    targetOrgIds.length > 0
      ? Activity.deleteMany({ organizationId: { $in: targetOrgIds } })
      : Promise.resolve({ deletedCount: 0 }),
    targetOrgIds.length > 0
      ? IncidentEmbedding.deleteMany({ organizationId: { $in: targetOrgIds } })
      : Promise.resolve({ deletedCount: 0 }),
  ]);

  return {
    incidents: incidents.deletedCount || 0,
    alerts: alerts.deletedCount || 0,
    services: services.deletedCount || 0,
    users: users.deletedCount || 0,
    organizations: orgs.deletedCount || 0,
    aiSuggestions: suggestions.deletedCount || 0,
    activities: activities.deletedCount || 0,
    embeddings: embeddings.deletedCount || 0,
  };
}

async function main() {
  console.log("===============================================================");
  console.log("🧹 RESOLVER BENCHMARK CLEANUP (bench:cleanup)");
  console.log("===============================================================");

  const conn = await connectToDb();
  const dbName = conn.connection.name || mongoose.connection.name || "unknown";
  console.log(`📦 Connected to MongoDB database: '${dbName}'`);

  const isSafeDb = dbName.toLowerCase().includes("bench") || dbName.toLowerCase().includes("test");
  if (!isSafeDb && !allowRealDb) {
    console.error(
      `❌ Refusing to clean database '${dbName}'. Database name must contain 'bench' or 'test' (or pass --allow-real-db).`
    );
    await disconnectFromDb();
    process.exit(1);
  }

  if (targetSession) {
    console.log(`🎯 Cleaning records for session: ${targetSession}`);
  } else {
    console.log("🎯 Cleaning all benchmark-seeded records (seeded:true / benchSession)...");
  }

  const results = await performCleanup(targetSession);

  console.log("\n📊 Cleanup Summary:");
  console.log(`   - Incidents Deleted:     ${results.incidents}`);
  console.log(`   - Alerts Deleted:        ${results.alerts}`);
  console.log(`   - Services Deleted:      ${results.services}`);
  console.log(`   - Users Deleted:         ${results.users}`);
  console.log(`   - Organizations Deleted: ${results.organizations}`);
  console.log(`   - AI Suggestions:        ${results.aiSuggestions}`);

  await disconnectFromDb();
  console.log("✅ Cleanup finished successfully.\n");
}

if (process.argv[1]?.endsWith("cleanup.ts")) {
  main().catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  });
}

