import { Queue, QueueOptions } from "bullmq";
import { getRedisClient } from "./connection";
import { config } from "../../../config/config";
import { incidentDao } from "../../../dao/incidentDao";
import { AI_STATUS } from "../../../types";
import { AlertRuleInput } from "../rulesEngine";

/**
 * ============================================================================
 * BullMQ Queue: `ai-jobs`
 * ============================================================================
 * BullMQ organizes background tasks into named Queues.
 *
 * Concepts for beginners:
 * 1. Queue: An interface that lets our Express API push "Jobs" into Redis.
 *    The API responds immediately to the user (e.g. 201 Created or 202 Accepted)
 *    without waiting for the slow LLM call to finish.
 * 2. Rate Limiting: We configure BullMQ's built-in token-bucket rate limiter
 *    to process a MAXIMUM of 10 jobs/minute. This protects us from hitting
 *    external provider quota limits (such as Groq or Gemini free-tier rate limits).
 * 3. Fail-Open Architecture: If Redis is offline or crashes, `addAiJob` catches
 *    the error, marks the incident AI status as "unavailable", and returns null.
 *    INCIDENT CREATION AND OPERATIONS NEVER WAIT ON OR FAIL BECAUSE OF REDIS.
 * ============================================================================
 */

export const AI_QUEUE_NAME = "ai-jobs";

export type AiJobType = "triage" | "summary" | "postmortem";

export interface AiJobData {
  jobType: AiJobType;
  incidentId: string;
  organizationId: string;
  userId?: string;
  serviceId?: string | null;
  alert?: AlertRuleInput | null;
  customInstructions?: string;
}

let aiQueue: Queue<AiJobData> | null = null;

/**
 * Returns the singleton BullMQ Queue instance for `ai-jobs`
 */
export function getAiQueue(): Queue<AiJobData> {
  if (aiQueue) {
    return aiQueue;
  }

  const redis = getRedisClient();

  const queueOptions: QueueOptions = {
    connection: redis,
    defaultJobOptions: {
      // Retries: Attempt up to 2 times with exponential backoff if a transient error occurs
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000, // 2s, then 4s
      },
      // Remove completed and failed jobs after a reasonable threshold to keep Redis memory minimal
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  };

  aiQueue = new Queue<AiJobData>(AI_QUEUE_NAME, queueOptions);

  aiQueue.on("error", (err) => {
    if (config.NODE_ENV !== "test") {
      console.warn("⚠️ [BullMQ:Queue] Queue background error (failing open):", err.message);
    }
  });

  return aiQueue;
}

/**
 * Enqueue an AI job safely.
 *
 * Guarantees:
 * - Fail-open: NEVER throws an error, even if Redis is down or BullMQ is disabled.
 * - Sets incident.ai.status to "pending" on queue success, or "unavailable" if AI/Redis is off.
 */
export async function addAiJob(jobData: AiJobData): Promise<string | null> {
  const { incidentId, organizationId, jobType } = jobData;

  // 1. If AI is globally disabled in config, mark status as unavailable and skip queueing
  if (!config.AI_ENABLED) {
    try {
      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.UNAVAILABLE,
      });
    } catch {
      // Ignore database write failures during fail-open
    }
    return null;
  }

  // 2. Mark incident as pending in database
  try {
    await incidentDao.updateByOrgAndId(organizationId, incidentId, {
      "ai.status": AI_STATUS.PENDING,
    });
  } catch (dbErr) {
    console.warn("⚠️ [BullMQ] Failed to set incident AI status to pending:", dbErr);
  }

  // 3. Attempt to add job to BullMQ queue
  try {
    const queue = getAiQueue();
    // Unique job name includes type and incident for clear observability in Bull Board
    const jobName = `${jobType}:${incidentId}`;
    const job = await queue.add(jobName, jobData, {
      jobId: `${jobType}-${incidentId}-${Date.now()}`,
    });

    return job.id || null;
  } catch (queueErr: unknown) {
    // Fail-open: Log clear warning, mark status as unavailable, but DO NOT THROW
    console.warn(
      `⚠️ [BullMQ] Failed to enqueue AI job (Redis offline or broker error). Failing open: ${(queueErr as Error)?.message || queueErr}`
    );

    try {
      await incidentDao.updateByOrgAndId(organizationId, incidentId, {
        "ai.status": AI_STATUS.UNAVAILABLE,
      });
    } catch {
      // Ignore secondary database errors
    }

    return null;
  }
}
