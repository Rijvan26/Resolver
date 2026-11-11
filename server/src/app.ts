import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { config } from "./config/config";
import { errorHandler } from "./middleware/errorHandler";
import { NotFoundError } from "./utils/errors";
import { isRedisConnected } from "./services/ai/queue/connection";

const app = express();

// Trust upstream reverse proxy (Render / Cloudflare / Nginx) so req.ip and rate-limiting see client IP
app.set("trust proxy", config.TRUST_PROXY);

// Security HTTP headers
app.use(helmet());

// CORS configuration (supports single or comma-separated origins)
const allowedOrigins = config.CORS_ORIGIN.split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins.length <= 1 ? allowedOrigins[0] || false : allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Body parsing with safe size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// Signed cookie parsing
app.use(cookieParser(config.COOKIE_SECRET));

import apiRoutes from "./routes";
import alertRoutes from "./routes/alertRoutes";
import assistantRoutes from "./routes/assistantRoutes";
import { createBullBoardRouter } from "./services/ai/queue/board";

// Health check endpoints
const healthHandler = (_req: Request, res: Response) => {
  const mongoConnected = mongoose.connection.readyState === 1;
  const redisConnected = isRedisConnected();

  let statusCode = 200;
  let overallStatus = "healthy";

  if (config.NODE_ENV === "production") {
    if (!mongoConnected) {
      statusCode = 503;
      overallStatus = "unhealthy";
    } else if (!redisConnected) {
      statusCode = 200; // Fail-open: API remains operational even if Redis is offline
      overallStatus = "degraded";
    }
  }

  res.status(statusCode).json({
    status: overallStatus,
    service: "resolver-api",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.NODE_ENV,
    database: {
      status: mongoConnected ? "connected" : "disconnected",
    },
    redis: {
      status: redisConnected ? "connected" : "disconnected",
    },
  });
};

app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

// API route mounting
app.use("/api/v1", apiRoutes);
app.use("/alerts", alertRoutes);
app.use("/assistant", assistantRoutes);

// Bull Board Admin Dashboard (Protected: SUPER_ADMIN and ADMIN only)
app.use(createBullBoardRouter());

// 404 Catch-all handler for undefined routes
app.use((req: Request, _res: Response, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

export default app;
