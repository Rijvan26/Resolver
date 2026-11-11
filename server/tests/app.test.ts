import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import mongoose from "mongoose";
import app from "../src/app";
import { config, validateEnv } from "../src/config/config";
import { buildRedisOptions } from "../src/services/ai/queue/connection";
import * as redisConnectionModule from "../src/services/ai/queue/connection";

describe("Express App Configuration & Health Check", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    (config as any).NODE_ENV = "test";
  });

  it("should respond with 200 on /health", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("resolver-api");
    expect(res.body.timestamp).toBeDefined();
    expect(typeof res.body.uptimeSeconds).toBe("number");
  });

  it("should respond with 200 on /api/v1/health", async () => {
    const res = await request(app).get("/api/v1/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.service).toBe("resolver-api");
  });

  it("should return standardized 404 response for undefined routes", async () => {
    const res = await request(app).get("/api/v1/non-existent-endpoint");

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe("NOT_FOUND");
    expect(res.body.error.message).toContain("Route not found");
  });

  it("should include security headers via Helmet", async () => {
    const res = await request(app).get("/health");

    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("should configure Express trust proxy for reverse-proxy deployments", () => {
    expect(app.get("trust proxy")).toBe(config.TRUST_PROXY);
  });

  it("should report 503 unhealthy on /health when NODE_ENV=production and MongoDB is disconnected", async () => {
    (config as any).NODE_ENV = "production";
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(0 as any);

    const res = await request(app).get("/health");

    expect(res.status).toBe(503);
    expect(res.body.status).toBe("unhealthy");
    expect(res.body.database.status).toBe("disconnected");
  });

  it("should report 200 degraded on /health when NODE_ENV=production, MongoDB is connected, and Redis is offline (fail-open)", async () => {
    (config as any).NODE_ENV = "production";
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1 as any);
    vi.spyOn(redisConnectionModule, "isRedisConnected").mockReturnValue(false);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("degraded");
    expect(res.body.database.status).toBe("connected");
    expect(res.body.redis.status).toBe("disconnected");
  });

  it("should report 200 healthy on /health when NODE_ENV=production and both MongoDB and Redis are connected", async () => {
    (config as any).NODE_ENV = "production";
    vi.spyOn(mongoose.connection, "readyState", "get").mockReturnValue(1 as any);
    vi.spyOn(redisConnectionModule, "isRedisConnected").mockReturnValue(true);

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("healthy");
    expect(res.body.database.status).toBe("connected");
    expect(res.body.redis.status).toBe("connected");
  });
});

describe("Production Configuration & Redis TLS Readiness", () => {
  afterEach(() => {
    (config as any).REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
  });

  it("should reject insecure defaults and localhost URLs when NODE_ENV=production", () => {
    const invalid = validateEnv({
      NODE_ENV: "production",
      JWT_ACCESS_SECRET: "strong_jwt_access_secret_at_least_32chars",
      JWT_REFRESH_SECRET: "strong_jwt_refresh_secret_at_least_32chars",
      COOKIE_SECRET: "strong_cookie_secret_at_least_32_characters",
    });

    expect(invalid.success).toBe(false);
    if (!invalid.success) {
      const paths = invalid.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("ALERT_INGEST_SECRET");
      expect(paths).toContain("MONGODB_URI");
      expect(paths).toContain("REDIS_URL");
      expect(paths).toContain("CORS_ORIGIN");
      expect(paths).toContain("INVITATION_BASE_URL");
      expect(paths).toContain("APP_URL");
    }
  });

  it("should accept valid remote HTTPS/Atlas/Upstash production configuration", () => {
    const valid = validateEnv({
      NODE_ENV: "production",
      PORT: "10000",
      APP_URL: "https://resolver-api.onrender.com",
      MONGODB_URI: "mongodb+srv://user:pass@cluster0.mongodb.net/resolver_prod",
      REDIS_URL: "rediss://default:secret@endpoint.upstash.io:6379",
      JWT_ACCESS_SECRET: "strong_jwt_access_secret_at_least_32chars",
      JWT_REFRESH_SECRET: "strong_jwt_refresh_secret_at_least_32chars",
      COOKIE_SECRET: "strong_cookie_secret_at_least_32_characters",
      CORS_ORIGIN: "https://resolver.vercel.app",
      INVITATION_BASE_URL: "https://resolver.vercel.app/accept-invitation",
      ALERT_INGEST_SECRET: "prod_webhook_ingest_secret_value_32chars",
    });

    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.PORT).toBe(10000);
      expect(valid.data.TRUST_PROXY).toBe(1);
    }
  });

  it("should enable TLS and role-appropriate offline queues for Upstash rediss:// URLs", () => {
    (config as any).REDIS_URL = "rediss://default:token@upstash-host.upstash.io:6379";

    const queueOpts = buildRedisOptions("queue");
    expect(queueOpts.enableOfflineQueue).toBe(false);
    expect(queueOpts.maxRetriesPerRequest).toBeNull();
    expect(queueOpts.tls).toEqual({ rejectUnauthorized: true });

    const workerOpts = buildRedisOptions("worker");
    expect(workerOpts.enableOfflineQueue).toBe(true);
    expect(workerOpts.maxRetriesPerRequest).toBeNull();
    expect(workerOpts.tls).toEqual({ rejectUnauthorized: true });
  });
});
