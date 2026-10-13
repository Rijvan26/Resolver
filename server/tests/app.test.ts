import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app";

describe("Express App Configuration & Health Check", () => {
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
});
