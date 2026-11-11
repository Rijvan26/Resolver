import dns from "node:dns";
import app from "./app";
import { config } from "./config/config";
import { connectToDb, disconnectFromDb } from "./config/db";
import { startAiWorker, startEmbedWorker, stopAiWorker } from "./services/ai/queue/worker";
import { closeAiQueues } from "./services/ai/queue/bullmq";
import { closeRedisConnection } from "./services/ai/queue/connection";

// Apply explicit public DNS resolvers only on non-production Windows environments
// to preserve container/cloud internal DNS resolution in production Linux hosts.
if (process.platform === "win32" && config.NODE_ENV !== "production") {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

const startServer = async () => {
  try {
    // 1. Establish database connection
    await connectToDb();

    // 2. Start Express HTTP server explicitly bound to 0.0.0.0 for PaaS / Render containers
    const server = app.listen(config.PORT, "0.0.0.0", () => {
      console.log(
        `🚀 Resolver API server listening on 0.0.0.0:${config.PORT} [${config.NODE_ENV}]`
      );
      console.log(`👉 Health check: http://0.0.0.0:${config.PORT}/health`);
    });

    // 3. Start background AI & embedding workers (fail-open if Redis is down)
    startAiWorker();
    startEmbedWorker();

    // 4. Graceful shutdown handler
    let isShuttingDown = false;
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      // Force shutdown after 10s timeout if cleanup stalls
      const forceTimer = setTimeout(() => {
        console.error("❌ Forced shutdown: Operations took too long to terminate.");
        process.exit(1);
      }, 10000);
      forceTimer.unref();

      // Stop accepting new connections and close idle keep-alive sockets immediately
      server.close(async () => {
        console.log("   - HTTP server closed.");
        try {
          await stopAiWorker();
          await closeAiQueues();
          await closeRedisConnection();
          console.log("   - Background workers & Redis connections closed.");
          await disconnectFromDb();
          console.log("   - MongoDB connection closed.");
          clearTimeout(forceTimer);
          process.exit(0);
        } catch (err) {
          console.error("❌ Error during shutdown:", err);
          process.exit(1);
        }
      });

      if (typeof server.closeIdleConnections === "function") {
        server.closeIdleConnections();
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Fatal error during server startup:", error);
    process.exit(1);
  }
};

startServer();
