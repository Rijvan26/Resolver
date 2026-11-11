import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { organizationDao } from "../src/dao/organizationDao";
import { userDao } from "../src/dao/userDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { config } from "../src/config/config";
import { ROLES, Role } from "../src/types";

describe("Canonical Settings API (/api/v1/settings)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  const setupOrgWithUser = async (role: Role = ROLES.ADMIN) => {
    const org = await organizationDao.create({
      name: "Acme Platform Engineering",
      slug: `acme-eng-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      statusPageEnabled: false,
      aiSettings: {
        alertGrouping: true,
        runbooks: true,
        assistant: true,
        alertGroupingWindowMinutes: 30,
        alertGroupingSimilarityThreshold: 0.82,
      },
    });

    const user = await userDao.create({
      name: `${role} User`,
      email: `${role.toLowerCase()}-${Date.now()}@acme.internal`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: org._id,
      isActive: true,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      email: user.email,
      role: user.role,
    });

    return { org, user, token };
  };

  // ============================================================================
  // 1. GET /api/v1/settings (Canonical Retrieval & Zero Secret Leakage)
  // ============================================================================
  describe("GET /api/v1/settings", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/settings");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toMatch(/^(AUTHENTICATION_ERROR|UNAUTHORIZED)$/);
    });

    it("should allow any authenticated member (Developer, Manager, Admin, Super Admin) to view settings", async () => {
      const { token: devToken } = await setupOrgWithUser(ROLES.DEVELOPER);

      const res = await request(app)
        .get("/api/v1/settings")
        .set("Authorization", `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Acme Platform Engineering");
      expect(res.body.data.aiSettings.alertGrouping).toBe(true);
      expect(res.body.data.aiSettings.alertGroupingSimilarityThreshold).toBe(0.82);
      expect(res.body.data.aiTelemetry).toBeDefined();
    });

    it("should NEVER leak API keys, tokens, or password hashes in response", async () => {
      const { token } = await setupOrgWithUser(ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      const resBody = JSON.stringify(res.body);

      // Verify zero secret leakage
      expect(resBody).not.toContain("passwordHash");
      expect(resBody).not.toContain(config.JWT_ACCESS_SECRET);
      expect(resBody).not.toContain(config.JWT_REFRESH_SECRET);
      expect(resBody).not.toContain(config.COOKIE_SECRET);
      expect(resBody).not.toContain(config.ALERT_INGEST_SECRET);
      if (process.env.GROQ_API_KEY) expect(resBody).not.toContain(process.env.GROQ_API_KEY);
      if (process.env.GEMINI_API_KEY) expect(resBody).not.toContain(process.env.GEMINI_API_KEY);
    });
  });

  // ============================================================================
  // 2. PATCH /api/v1/settings (Admin-Only RBAC & Strict Field Validation)
  // ============================================================================
  describe("PATCH /api/v1/settings", () => {
    it("should allow SUPER_ADMIN and ADMIN to update settings", async () => {
      const { token: adminToken } = await setupOrgWithUser(ROLES.ADMIN);

      const res = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "Acme Platform Engineering Updated",
          statusPageEnabled: true,
          aiSettings: {
            alertGrouping: false,
            runbooks: true,
            assistant: true,
            alertGroupingWindowMinutes: 45,
            alertGroupingSimilarityThreshold: 0.90,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Acme Platform Engineering Updated");
      expect(res.body.data.statusPageEnabled).toBe(true);
      expect(res.body.data.aiSettings.alertGrouping).toBe(false);
      expect(res.body.data.aiSettings.alertGroupingWindowMinutes).toBe(45);
      expect(res.body.data.aiSettings.alertGroupingSimilarityThreshold).toBe(0.90);
    });

    it("should reject DEVELOPER and MANAGER from updating settings with 403 Forbidden", async () => {
      const { token: devToken } = await setupOrgWithUser(ROLES.DEVELOPER);

      const res1 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${devToken}`)
        .send({ name: "Hacked Org Name" });

      expect(res1.status).toBe(403);
      expect(res1.body.error.code).toBe("FORBIDDEN");

      const { token: mgrToken } = await setupOrgWithUser(ROLES.MANAGER);

      const res2 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${mgrToken}`)
        .send({ statusPageEnabled: true });

      expect(res2.status).toBe(403);
      expect(res2.body.error.code).toBe("FORBIDDEN");
    });

    it("should strictly validate fields and reject invalid data with 400 VALIDATION_ERROR", async () => {
      const { token } = await setupOrgWithUser(ROLES.ADMIN);

      // Name too short (< 2 characters)
      const res1 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({ name: "A" });

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe("VALIDATION_ERROR");

      // Invalid similarity threshold (> 1)
      const res2 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          aiSettings: {
            alertGroupingSimilarityThreshold: 1.5,
          },
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe("VALIDATION_ERROR");

      // Invalid window minutes (< 1)
      const res3 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          aiSettings: {
            alertGroupingWindowMinutes: 0,
          },
        });

      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe("VALIDATION_ERROR");

      // Unknown/unauthorized fields rejected (.strict() mode)
      const res4 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({
          unauthorizedField: "malicious_payload",
        });

      expect(res4.status).toBe(400);
      expect(res4.body.error.code).toBe("VALIDATION_ERROR");

      // Empty payload rejected
      const res5 = await request(app)
        .patch("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res5.status).toBe(400);
      expect(res5.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ============================================================================
  // 3. Endpoint Aliasing Verification
  // ============================================================================
  describe("3. Canonical Endpoint Aliasing", () => {
    it("should return identical canonical data via aliased /organizations/me", async () => {
      const { token } = await setupOrgWithUser(ROLES.ADMIN);

      const canonicalRes = await request(app)
        .get("/api/v1/settings")
        .set("Authorization", `Bearer ${token}`);

      const aliasRes = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token}`);

      expect(aliasRes.status).toBe(200);
      expect(aliasRes.body.data.id).toBe(canonicalRes.body.data.id);
      expect(aliasRes.body.data.name).toBe(canonicalRes.body.data.name);
      expect(aliasRes.body.data.aiSettings).toEqual(canonicalRes.body.data.aiSettings);
    });
  });
});
