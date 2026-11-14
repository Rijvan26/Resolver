import dns from "node:dns";
import app from "./app";
import { config } from "./config/config";
import { connectToDb, disconnectFromDb } from "./config/db";
import { startAiWorker, startEmbedWorker, stopAiWorker } from "./services/ai/queue/worker";
import { closeAiQueues } from "./services/ai/queue/bullmq";
import { closeRedisConnection } from "./services/ai/queue/connection";

// Ensure IPv4 is prioritized to avoid 20s IPv6 socket connect timeouts on dual-stack networks
dns.setDefaultResultOrder("ipv4first");

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
      console.log(`Email provider: ${config.EMAIL_PROVIDER}, from: ${config.EMAIL_FROM}`);

      if (config.NODE_ENV === "production") {
        const hasApiKey = Boolean(config.EMAIL_API_KEY || config.BREVO_API_KEY);
        if (!hasApiKey) {
          console.warn("⚠️ [Startup Warning] EMAIL_API_KEY is missing in production. Brevo HTTP email delivery will fail.");
        }
        if (!config.CLIENT_URL) {
          console.warn("⚠️ [Startup Warning] CLIENT_URL is missing in production. Defaulting to INVITATION_BASE_URL.");
        }
      }
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
