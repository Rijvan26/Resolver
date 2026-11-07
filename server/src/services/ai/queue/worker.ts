import { Worker, Job } from "bullmq";
import { getRedisClient } from "./connection";
import { AI_QUEUE_NAME, AiJobData } from "./bullmq";
import { config } from "../../../config/config";
import { aiService, hashInput, normalizePriority } from "../aiService";

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
 * Stop the worker during graceful server shutdown
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
}
