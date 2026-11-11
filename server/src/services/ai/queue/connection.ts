import Redis, { RedisOptions } from "ioredis";
import { config } from "../../../config/config";

/**
 * ============================================================================
 * Redis Connection for BullMQ (Local & Upstash TLS Ready)
 * ============================================================================
 * - Supports standard `redis://` and TLS-encrypted `rediss://` (Upstash) URLs.
 * - Uses separate Redis connections for blocking BullMQ Workers vs non-blocking
 *   Queue producers per BullMQ best practices.
 * - Queue connections use `enableOfflineQueue: false` so API calls fail open
 *   immediately if Redis is unreachable.
 * - Worker connections use `enableOfflineQueue: true` so blocking commands
 *   wait cleanly through initial TLS handshakes and transient reconnects.
 * ============================================================================
 */

let redisClient: Redis | null = null;
const workerClients: Redis[] = [];
let isConnected = false;

/**
 * Builds production-ready ioredis options for BullMQ queues or workers.
 */
export function buildRedisOptions(purpose: "queue" | "worker" = "queue"): RedisOptions {
  const isTls = config.REDIS_URL.trim().toLowerCase().startsWith("rediss://");

  const options: RedisOptions = {
    // BullMQ requires maxRetriesPerRequest to be null
    maxRetriesPerRequest: null,
    // Upstash & managed Redis compatibility
    enableReadyCheck: false,
    lazyConnect: true,
    // Workers need offline queue enabled through TLS handshakes; API queues fail open fast
    enableOfflineQueue: purpose === "worker",
    keepAlive: 30000,
    connectTimeout: 10000,
    retryStrategy(times) {
      if (config.NODE_ENV === "test") {
        return null;
      }
      return Math.min(times * 1000, 15000);
    },
  };

  if (isTls) {
    options.tls = {
      rejectUnauthorized: true,
    };
  }

  return options;
}

function attachRedisListeners(client: Redis, label: string, trackPrimaryState: boolean): void {
  client.on("connect", () => {
    if (trackPrimaryState) isConnected = true;
    if (config.NODE_ENV !== "test") {
      console.log(`🔌 [Redis:${label}] Connection established.`);
    }
  });

  client.on("ready", () => {
    if (trackPrimaryState) isConnected = true;
  });

  client.on("error", (err) => {
    if (trackPrimaryState) isConnected = false;
    if (config.NODE_ENV !== "test") {
      console.warn(`⚠️ [Redis:${label}] Broker error (failing open):`, err.message);
    }
  });

  client.on("close", () => {
    if (trackPrimaryState) isConnected = false;
  });
}

/**
 * Retrieves the singleton ioredis client for Queue producers (`enableOfflineQueue: false`).
 */
export function getRedisClient(): Redis {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(config.REDIS_URL, buildRedisOptions("queue"));
  attachRedisListeners(redisClient, "queue", true);
  return redisClient;
}

/**
 * Creates a dedicated ioredis connection for a BullMQ Worker (`enableOfflineQueue: true`).
 */
export function createWorkerRedisConnection(label = "worker"): Redis {
  const client = new Redis(config.REDIS_URL, buildRedisOptions("worker"));
  attachRedisListeners(client, label, false);
  workerClients.push(client);
  return client;
}

/**
 * Quick helper to check whether Redis is currently reachable.
 */
export function isRedisConnected(): boolean {
  if (redisClient?.status === "ready") return true;
  if (workerClients.some((client) => client.status === "ready")) return true;
  return isConnected;
}

/**
 * Safely closes all tracked Redis connections during graceful server shutdown.
 */
export async function closeRedisConnection(): Promise<void> {
  const closeOne = async (client: Redis | null) => {
    if (!client) return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  };

  const workersToClose = workerClients.splice(0, workerClients.length);
  await Promise.all(workersToClose.map((c) => closeOne(c)));

  if (redisClient) {
    const primary = redisClient;
    redisClient = null;
    await closeOne(primary);
  }

  isConnected = false;
}
