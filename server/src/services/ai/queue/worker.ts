import { Worker, Job } from "bullmq";
import { getRedisClient } from "./connection";
import {
  AI_QUEUE_NAME,
  AiJobData,
  AI_EMBED_QUEUE_NAME,
  EmbedJobData,
} from "./bullmq";
import { config } from "../../../config/config";
import { aiService, hashInput, normalizePriority } from "../aiService";
import { incidentDao } from "../../../dao/incidentDao";
import { serviceDao } from "../../../dao/serviceDao";
import { incidentEmbeddingDao } from "../../../dao/incidentEmbeddingDao";
import { buildIncidentEmbeddingText } from "../embeddings/incidentEmbedText";
import { getEmbeddingProvider } from "../embeddings";

export { hashInput, normalizePriority };

/**
 * ============================================================================
 * BullMQ Worker: `ai-jobs`
 * ============================================================================
 *
 * Concepts for beginners:
 * 1. Worker: An independent background process that consumes jobs from the
 *    `ai-jobs` queue in Redis. It does the heavy lifting (database queries,
 *    sanitization, external LLM HTTP calls) so HTTP request handlers remain
 *    lightning fast (< 50ms).
 * 2. Concurrency: Set to 2. This means the worker can execute up to 2 AI jobs
 *    simultaneously without choking our AMD A6 dual-core machine.
 * 3. Idempotency & Input Hashes: Before calling an external model, we compute
 *    a SHA-256 hash of the sanitized input. If an identical suggestion was already
 *    generated, we can return the cached output immediately.
 * 4. Human-In-The-Loop: AI output is ALWAYS saved with `userDecision: 'pending'`.
 *    The AI NEVER mutates the incident severity or pages engineers directly.
 * ============================================================================
 */

let aiWorker: Worker<AiJobData> | null = null;

/**
 * Process a `triage` job
 */
export async function processTriageJob(data: AiJobData): Promise<void> {
  await aiService.generateTriage(data.incidentId, data.organizationId, data.alert);
}

/**
 * Process a `summary` job
 */
export async function processSummaryJob(data: AiJobData): Promise<void> {
  await aiService.generateSummary(data.incidentId, data.organizationId);
}

/**
 * Process a `postmortem` job
 */
export async function processPostmortemJob(data: AiJobData): Promise<void> {
  try {
    await aiService.generatePostmortem(data.incidentId, data.organizationId);
  } catch (err) {
    // Non-resolved postmortem attempt or provider error - log and fail gracefully
    console.warn(`[AiWorker:Postmortem] Could not process postmortem:`, (err as Error)?.message || err);
  }
}

/**
 * Top-level job router executed by the BullMQ worker
 */
export async function processAiJob(job: Job<AiJobData>): Promise<void> {
  const { jobType } = job.data;

  switch (jobType) {
    case "triage":
      await processTriageJob(job.data);
      break;
    case "summary":
      await processSummaryJob(job.data);
      break;
    case "postmortem":
      await processPostmortemJob(job.data);
      break;
    case "statusDraft":
      await aiService.generateStatusDraft(
        job.data.incidentId,
        job.data.organizationId,
        job.data.audience || "internal"
      );
      break;
    default:
      console.warn(`[AiWorker] Unrecognized jobType: ${jobType}`);
  }
}

/**
 * Start the background BullMQ Worker.
 * Gracefully ignores startup if Redis is unreachable in test mode.
 */
export function startAiWorker(): Worker<AiJobData> | null {
  if (aiWorker) {
    return aiWorker;
  }

  try {
    const redis = getRedisClient();

    aiWorker = new Worker<AiJobData>(AI_QUEUE_NAME, processAiJob, {
      connection: redis,
      concurrency: 2, // Concurrency 2: conservative for weak CPU
      limiter: {
        max: 10,
        duration: 60000, // Rate limiter: max 10 jobs/minute to avoid burning free-tier API quotas
      },
    });

    aiWorker.on("completed", (job) => {
      if (config.NODE_ENV !== "test") {
        console.log(`✅ [BullMQ:Worker] Job ${job.id} (${job.name}) completed successfully.`);
      }
    });

    aiWorker.on("failed", (job, err) => {
      console.warn(`⚠️ [BullMQ:Worker] Job ${job?.id} failed:`, err.message);
    });

    aiWorker.on("error", (err) => {
      if (config.NODE_ENV !== "test") {
        console.warn("⚠️ [BullMQ:Worker] Worker Redis connection error (failing open):", err.message);
      }
    });

    return aiWorker;
  } catch (err: unknown) {
    console.warn("⚠️ [BullMQ:Worker] Could not start worker (failing open):", (err as Error)?.message || err);
    return null;
  }
}

/**
 * ============================================================================
 * BullMQ Worker: `ai-embed` (Embedding Worker)
 * ============================================================================
 * Consumes incident embedding tasks from the `ai-embed` queue.
 *
 * Performance and Safety Controls:
 * 1. Concurrency 1: Strictly processes one embedding at a time, ensuring zero
 *    CPU choking on resource-constrained dual-core systems.
 * 2. Rate Limiting: Capped at 30 jobs/minute to respect API quotas.
 * 3. Text Hashing & Idempotency: Compares SHA-256 hash of the sanitized text
 *    against existing embedding in MongoDB. If unchanged, skips re-embedding!
 * ============================================================================
 */

let embedWorker: Worker<EmbedJobData> | null = null;

/**
 * Process an incident embedding job
 */
export async function processEmbedJob(data: EmbedJobData): Promise<void> {
  const incident = await incidentDao.findByOrgAndId(data.organizationId, data.incidentId);
  if (!incident) {
    return;
  }

  let serviceName: string | null = null;
  if (incident.serviceId) {
    try {
      const service = await serviceDao.findById(incident.serviceId);
      if (service) {
        serviceName = service.name;
      }
    } catch {
      // Non-blocking fallback
    }
  }

  const { text, textHash } = buildIncidentEmbeddingText({
    title: incident.title,
    serviceName,
    description: incident.description,
    resolutionNotes: incident.ai?.summary || null,
  });

  // Skip re-embedding if textHash has not changed (unless forced)
  if (!data.force) {
    const existing = await incidentEmbeddingDao.findByIncidentId(incident._id);
    if (existing && existing.textHash === textHash) {
      return; // Text unchanged, no re-embedding needed!
    }
  }

  const provider = getEmbeddingProvider();
  const result = await provider.embed([text]);

  if (!result.vectors || result.vectors.length === 0 || !result.vectors[0]) {
    throw new Error("Embedding provider returned empty vector array");
  }

  await incidentEmbeddingDao.upsert({
    incidentId: incident._id,
    organizationId: incident.organizationId,
    vector: result.vectors[0],
    model: result.model,
    provider: result.provider,
    dim: result.dim,
    textHash,
  });

  // Step 3 (FR-06): Find likely duplicates among OPEN incidents on creation
  try {
    await aiService.detectDuplicates(incident._id, incident.organizationId);
  } catch (dupErr) {
    // Fail-open: duplicate check error never fails the embedding job
    if (config.NODE_ENV !== "test") {
      console.warn("⚠️ [BullMQ:EmbedWorker] Duplicate check failed (fail-open):", dupErr);
    }
  }
}

/**
 * Start the background BullMQ Embedding Worker
 */
export function startEmbedWorker(): Worker<EmbedJobData> | null {
  if (embedWorker) {
    return embedWorker;
  }

  try {
    const redis = getRedisClient();

    embedWorker = new Worker<EmbedJobData>(
      AI_EMBED_QUEUE_NAME,
      async (job: Job<EmbedJobData>) => {
        await processEmbedJob(job.data);
      },
      {
        connection: redis,
        concurrency: 1, // Concurrency 1: strictly single-threaded execution for weak CPU
        limiter: {
          max: 30,
          duration: 60000, // 30 jobs/minute rate limiter
        },
      }
    );

    embedWorker.on("completed", (job) => {
      if (config.NODE_ENV !== "test") {
        console.log(`✅ [BullMQ:EmbedWorker] Embedded incident ${job.data.incidentId}`);
      }
    });

    embedWorker.on("failed", (job, err) => {
      console.warn(`⚠️ [BullMQ:EmbedWorker] Job ${job?.id} failed:`, err.message);
    });

    embedWorker.on("error", (err) => {
      if (config.NODE_ENV !== "test") {
        console.warn("⚠️ [BullMQ:EmbedWorker] Worker Redis error (failing open):", err.message);
      }
    });

    return embedWorker;
  } catch (err: unknown) {
    console.warn("⚠️ [BullMQ:EmbedWorker] Could not start embed worker (failing open):", (err as Error)?.message || err);
    return null;
  }
}

/**
 * Stop workers during graceful server shutdown
 */
export async function stopAiWorker(): Promise<void> {
  if (aiWorker) {
    try {
      await aiWorker.close();
    } catch {
      // Ignore close errors
    } finally {
      aiWorker = null;
    }
  }

  if (embedWorker) {
    try {
      await embedWorker.close();
    } catch {
      // Ignore close errors
    } finally {
      embedWorker = null;
    }
  }
}
