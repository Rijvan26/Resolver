import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/config";
import { errorHandler } from "./middleware/errorHandler";
import { NotFoundError } from "./utils/errors";

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: config.CORS_ORIGIN,
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

// Health check endpoints
const healthHandler = (_req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    service: "resolver-api",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: config.NODE_ENV,
  });
};

app.get("/health", healthHandler);
app.get("/api/v1/health", healthHandler);

// API route mounting
app.use("/api/v1", apiRoutes);

// 404 Catch-all handler for undefined routes
app.use((req: Request, _res: Response, next) => {
  next(new NotFoundError(`Route not found: ${req.method} ${req.originalUrl}`));
});

// Centralized error handler
app.use(errorHandler);

export default app;
