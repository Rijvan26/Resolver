import mongoose, { ConnectOptions } from "mongoose";
import { config } from "./config";

let isConnected = false;
let isGracefulDisconnect = false;

export interface DbConnectionOptions {
  uri?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Sensible default connection options for MongoDB (especially Atlas clusters).
 * Prevents idle socket dropouts, avoids socket explosions, and provides fast fail detection.
 */
export const DEFAULT_MONGOOSE_OPTIONS: ConnectOptions = {
  serverSelectionTimeoutMS: 10000, // 10s: Fast failure detection instead of hanging 30s
  maxIdleTimeMS: 45000,            // 45s: Prunes idle sockets client-side before Atlas resets them
  minPoolSize: 2,                  // Keeps 2 warm connections to avoid cold-start disconnects between sporadic BullMQ jobs
  maxPoolSize: 10,                 // Conservative pool limit for dual-core laptop / free tier
  socketTimeoutMS: 45000,          // 45s: Closes dead sockets cleanly
  heartbeatFrequencyMS: 10000,     // 10s: Background ping keeps connections active through NAT/proxies
};

/**
 * Connect to MongoDB with automatic retry capability.
 * Defaults to 5 retries with an 8-second interval between attempts if connection fails.
 */
export const connectToDb = async (
  optionsOrUri?: string | DbConnectionOptions
): Promise<typeof mongoose> => {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const options: DbConnectionOptions =
    typeof optionsOrUri === "string"
      ? { uri: optionsOrUri }
      : optionsOrUri || {};

  const uri = options.uri || config.MONGODB_URI;
  const maxRetries = options.maxRetries ?? config.DB_CONNECT_MAX_RETRIES; // Default 5
  const retryDelayMs = options.retryDelayMs ?? config.DB_CONNECT_RETRY_DELAY_MS; // Default 8000 (8s)

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (config.NODE_ENV !== "test" && attempt > 1) {
        console.log(`🔄 [Database] Attempt ${attempt} of ${maxRetries} to connect to MongoDB...`);
      }

      isGracefulDisconnect = false;
      const conn = await mongoose.connect(uri, DEFAULT_MONGOOSE_OPTIONS);
      isConnected = true;

      if (config.NODE_ENV !== "test") {
        console.log(`✅ Connected to MongoDB: ${conn.connection.host}/${conn.connection.name}`);
      }

      // Attach connection lifecycle listeners only once
      if (mongoose.connection.listenerCount("error") === 0) {
        mongoose.connection.on("error", (err) => {
          console.error("❌ MongoDB connection error:", err);
        });

        mongoose.connection.on("connected", () => {
          isConnected = true;
        });

        mongoose.connection.on("reconnected", () => {
          isConnected = true;
          if (config.NODE_ENV !== "test") {
            console.log("🔄 [Database] MongoDB connection restored (reconnected).");
          }
        });

        mongoose.connection.on("disconnected", () => {
          isConnected = false;
          if (config.NODE_ENV !== "test") {
            if (isGracefulDisconnect) {
              console.log("ℹ️  [Database] MongoDB disconnected cleanly.");
            } else {
              console.log("ℹ️  [Database] MongoDB connection paused (driver reconnecting)...");
            }
          }
        });
      }

      return conn;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (attempt < maxRetries) {
        const delaySeconds = retryDelayMs / 1000;
        if (config.NODE_ENV !== "test") {
          console.warn(
            `⚠️ [Database] Connection attempt ${attempt} of ${maxRetries} failed: ${errorMessage}. Reconnecting in ${delaySeconds} seconds...`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      } else {
        console.error(
          `❌ [Database] All ${maxRetries} connection attempts failed. Last error: ${errorMessage}`
        );
        throw error;
      }
    }
  }

  throw new Error(`Failed to connect to MongoDB after ${maxRetries} attempts.`);
};

/**
 * Disconnect from MongoDB gracefully.
 */
export const disconnectFromDb = async (): Promise<void> => {
  if (mongoose.connection.readyState !== 0) {
    isGracefulDisconnect = true;
    await mongoose.disconnect();
    isConnected = false;
  }
};

/**
 * Backwards-compatibility alias for legacy scripts
 */
export const connectDatabase = connectToDb;

/**
 * Checks whether the current MongoDB deployment supports multi-document transactions.
 * Transactions require a Replica Set or Sharded cluster (not standalone 'Single' mode).
 */
export const isTransactionSupported = (): boolean => {
  try {
    const client = mongoose.connection.getClient();
    const topology = (client as unknown as { topology?: { description?: { type?: string } } }).topology;
    const type = topology?.description?.type;

    if (!type) {
      return false;
    }

    return type === "ReplicaSetWithPrimary" || type === "Sharded";
  } catch {
    return false;
  }
};

export default connectToDb;