import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from server root
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { connectDatabase } from "../src/config/db";
import { Incident } from "../src/models/Incident";
import { Service } from "../src/models/Service";
import { incidentEmbeddingDao } from "../src/dao/incidentEmbeddingDao";
import { getEmbeddingProvider } from "../src/services/ai/embeddings";
import { buildIncidentEmbeddingText } from "../src/services/ai/embeddings/incidentEmbedText";

interface BackfillOptions {
  batchSize: number;
  organizationId?: string;
  force: boolean;
  limit?: number;
}

function parseArgs(): BackfillOptions {
  const args = process.argv.slice(2);
  const options: BackfillOptions = {
    batchSize: 20,
    force: false,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--batchSize" && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1], 10) || 20;
      i++;
    } else if (args[i] === "--orgId" && args[i + 1]) {
      options.organizationId = args[i + 1];
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--force") {
      options.force = true;
    }
  }

  return options;
}

async function runBackfill() {
  const options = parseArgs();
  console.log("==================================================================");
  console.log("🚀 Starting Incident Embeddings Backfill");
  console.log(`   - Batch Size: ${options.batchSize}`);
  console.log(`   - Force Re-embed: ${options.force}`);
  if (options.organizationId) console.log(`   - Scoped Org ID: ${options.organizationId}`);
  if (options.limit) console.log(`   - Record Limit: ${options.limit}`);
  console.log("==================================================================");

  await connectDatabase();

  const provider = getEmbeddingProvider();
  console.log(`[Backfill] Using embedding provider: "${provider.name}"`);

  const query: Record<string, unknown> = {};
  if (options.organizationId) {
    query.organizationId = new mongoose.Types.ObjectId(options.organizationId);
  }

  const totalIncidents = await Incident.countDocuments(query).exec();
  const maxToProcess = options.limit ? Math.min(options.limit, totalIncidents) : totalIncidents;
  console.log(`[Backfill] Found ${totalIncidents} incident(s). Processing ${maxToProcess}...`);

  if (maxToProcess === 0) {
    console.log("[Backfill] Nothing to process. Exiting.");
    await mongoose.disconnect();
    process.exit(0);
  }

  let processedCount = 0;
  let embeddedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const startTime = Date.now();

  let skip = 0;
  while (processedCount < maxToProcess) {
    const currentBatchLimit = Math.min(options.batchSize, maxToProcess - processedCount);
    const incidents = await Incident.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(currentBatchLimit)
      .exec();

    if (incidents.length === 0) {
      break;
    }

    for (const incident of incidents) {
      try {
        let serviceName: string | null = null;
        if (incident.serviceId) {
          const service = await Service.findById(incident.serviceId).exec();
          if (service) {
            serviceName = service.name;
          }
        }

        const { text, textHash } = buildIncidentEmbeddingText({
          title: incident.title,
          serviceName,
          description: incident.description,
          resolutionNotes: incident.ai?.summary || null,
        });

        // Check if existing embedding has identical textHash
        if (!options.force) {
          const existing = await incidentEmbeddingDao.findByIncidentId(incident._id);
          if (existing && existing.textHash === textHash) {
            skippedCount++;
            processedCount++;
            continue;
          }
        }

        // Generate embedding vector
        const result = await provider.embed([text]);
        if (result.vectors && result.vectors.length > 0 && result.vectors[0]) {
          await incidentEmbeddingDao.upsert({
            incidentId: incident._id,
            organizationId: incident.organizationId,
            vector: result.vectors[0],
            model: result.model,
            provider: result.provider,
            dim: result.dim,
            textHash,
          });
          embeddedCount++;
        } else {
          errorCount++;
        }
      } catch (err) {
        errorCount++;
        console.warn(`[Backfill] Failed to embed incident ${incident._id}:`, (err as Error)?.message || err);
      }

      processedCount++;
    }

    skip += incidents.length;
    console.log(
      `[Backfill] Progress: ${processedCount}/${maxToProcess} (Embedded: ${embeddedCount}, Skipped: ${skippedCount}, Errors: ${errorCount})`
    );
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log("==================================================================");
  console.log("✅ Backfill Complete!");
  console.log(`   - Total Processed: ${processedCount}`);
  console.log(`   - Newly Embedded: ${embeddedCount}`);
  console.log(`   - Skipped (Unchanged): ${skippedCount}`);
  console.log(`   - Errors: ${errorCount}`);
  console.log(`   - Elapsed Time: ${durationSec}s`);
  console.log("==================================================================");

  await mongoose.disconnect();
}

runBackfill().catch((err) => {
  console.error("❌ Fatal error in backfill script:", err);
  mongoose.disconnect().finally(() => process.exit(1));
});

