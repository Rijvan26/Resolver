import Redis, { RedisOptions } from "ioredis";
import { config } from "../../../config/config";

/**
 * ============================================================================
 * Redis Connection for BullMQ
 * ============================================================================
 * BullMQ uses Redis as an in-memory message broker to store background jobs,
 * coordinate workers, and maintain job queues.
 *
 * For a beginner learning BullMQ + Redis:
 * - A "Queue" pushes jobs into Redis lists/sets.
 * - A "Worker" listens to Redis and pulls jobs to process asynchronously in the background.
 * - If Redis is unreachable, our system is designed to "fail open" — meaning
 *   incident creation and normal operations NEVER crash or hang waiting for Redis.
 * ============================================================================
 */

let redisClient: Redis | null = null;
let isConnected = false;

/**
 * Creates or retrieves the singleton ioredis client.
 * Configured with fail-safe settings so Redis outages do not crash Express.
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  const redisOptions: RedisOptions = {
    // BullMQ requires maxRetriesPerRequest to be null so commands wait for reconnection
    maxRetriesPerRequest: null,
    // Do not fail startup immediately if Redis is temporarily offline (fail-open architecture)
    enableReadyCheck: false,
    lazyConnect: true,
    // Reconnection backoff strategy: retry every 2s up to 10s max
    retryStrategy(times) {
      const delay = Math.min(times * 1000, 10000);
      return delay;
    },
  };

  redisClient = new Redis(config.REDIS_URL, redisOptions);

  // Event Listeners for Redis Connection Lifecycle
  redisClient.on("connect", () => {
    isConnected = true;
    if (config.NODE_ENV !== "test") {
      console.log("🔌 [Redis] Connection established with Redis broker.");
    }
  });

  redisClient.on("ready", () => {
    isConnected = true;
  });

  redisClient.on("error", (err) => {
    isConnected = false;
    // In test mode or when Redis is offline in dev, log a clean warning without unhandled rejection
    if (config.NODE_ENV !== "test") {
      console.warn("⚠️ [Redis] Broker error (failing open):", err.message);
    }
  });

  redisClient.on("close", () => {
    isConnected = false;
  });

  return redisClient;
}

/**
 * Quick helper to check whether Redis is currently reachable.
 */
export function isRedisConnected(): boolean {
  return isConnected;
}

/**
 * Safely closes Redis connection during graceful server shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    } finally {
      redisClient = null;
      isConnected = false;
    }
  }
}

