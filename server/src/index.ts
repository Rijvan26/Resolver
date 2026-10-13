import app from "./app";
import { config } from "./config/config";
import { connectToDb, disconnectFromDb } from "./config/db";
import dns from "node:dns"
dns.setServers(['1.1.1.1','8.8.8.8'])

const startServer = async () => {
  try {
    // 1. Establish database connection
    await connectToDb();

    // 2. Start Express HTTP server
    const server = app.listen(config.PORT, () => {
      console.log(`🚀 Resolver API server running on port ${config.PORT} [${config.NODE_ENV}]`);
      console.log(`👉 Health check: http://localhost:${config.PORT}/health`);
    });

    // 3. Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

      server.close(async () => {
        console.log("   - HTTP server closed.");
        try {
          await disconnectFromDb();
          console.log("   - MongoDB connection closed.");
          process.exit(0);
        } catch (err) {
          console.error("❌ Error during database disconnect:", err);
          process.exit(1);
        }
      });

      // Force shutdown after 10s timeout
      setTimeout(() => {
        console.error("❌ Forced shutdown: Operations took too long to terminate.");
        process.exit(1);
      }, 10000);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    console.error("❌ Fatal error during server startup:", error);
    process.exit(1);
  }
};

startServer();
