import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../src/app";
import { config } from "../src/config/config";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { incidentDao } from "../src/dao/incidentDao";
import { serviceDao } from "../src/dao/serviceDao";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { isReportVague } from "../src/services/ai/vaguenessRules";
import { aiService } from "../src/services/ai/aiService";
import {
  ROLES,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
} from "../src/types";

describe("AI Checkpoint B: Report Clarification (FR-05) & Status Drafts (FR-09)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 60000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.restoreAllMocks();
    (config as any).AI_ENABLED = true;
    (config as any).AI_PROVIDER = "fake";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupOrgWithUser = async (orgName = "Acme SRE", slug = "acme-sre") => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: "Oncall Responder",
      email: `oncall-${Date.now()}@${slug}.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role: ROLES.ADMIN,
      organizationId: org._id,
      isActive: true,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role: user.role,
    });

    return { org, user, token };
  };

  describe("1. Vagueness Rules Engine (isReportVague - Cheap Heuristics)", () => {
    it("should return isVague: false when both title and description are empty", () => {
      const res = isReportVague({ title: "", description: "" });
      expect(res.isVague).toBe(false);
    });

    it("should flag report as vague when title is shorter than 15 characters", () => {
      const res = isReportVague({
        title: "Bug in app",
        description: "Users are experiencing persistent 504 timeouts on checkout",
        serviceId: "svc123",
      });

      expect(res.isVague).toBe(true);
      expect(res.reason).toContain("Title is very short");
    });

    it("should flag report as vague when description is shorter than 30 characters", () => {
      const res = isReportVague({
        title: "Payment gateway error rate spiked",
        description: "it broke please fix",
        serviceId: "svc123",
      });

      expect(res.isVague).toBe(true);
      expect(res.reason).toContain("Description is too brief");
    });

    it("should flag report as vague when no technical symptom/impact keywords exist", () => {
      const res = isReportVague({
        title: "New feature behavior inquiry",
        description: "Users noticed something strange about the new user onboarding step",
        serviceId: "svc123",
      });

      expect(res.isVague).toBe(true);
      expect(res.reason).toContain("does not mention specific error codes");
    });

    it("should return isVague: false when title, description, symptoms, and service are well-defined", () => {
      const res = isReportVague({
        title: "Cart service 500 error rate spike",
        description: "Shopping cart checkout is returning 500 internal server error timeouts for 30% of active sessions",
        serviceId: "svc_cart_1",
      });

      expect(res.isVague).toBe(false);
      expect(res.reason).toBeNull();
    });
  });

  describe("2. POST /api/v1/reports/ai/clarify Endpoint", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const res = await request(app)
        .post("/api/v1/reports/ai/clarify")
        .send({ title: "Short", description: "Vague" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return vague: false with zero questions immediately when report is clear (cheapest first)", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .post("/api/v1/reports/ai/clarify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Stripe webhook 504 gateway timeout",
          description: "Payment webhooks are timing out with HTTP 504 errors affecting customer invoices",
          serviceId: "svc_payment",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vague).toBe(false);
      expect(res.body.data.questions).toEqual([]);
    });

    it("should return up to 3 clarifying questions when report is vague", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .post("/api/v1/reports/ai/clarify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Something broke",
          description: "Users complaining on Slack",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vague).toBe(true);
      expect(Array.isArray(res.body.data.questions)).toBe(true);
      expect(res.body.data.questions.length).toBeLessThanOrEqual(3);
    });

    it("should return vague with empty questions when AI is disabled (fail-open)", async () => {
      const { token } = await setupOrgWithUser();
      (config as any).AI_ENABLED = false;

      const res = await request(app)
        .post("/api/v1/reports/ai/clarify")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Site is broken",
          description: "Not loading",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.vague).toBe(true);
      expect(res.body.data.questions).toEqual([]);
    });
  });

  describe("3. POST /api/v1/incidents/:id/ai/status-draft Endpoint", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app)
        .post(`/api/v1/incidents/${fakeId}/ai/status-draft`)
        .send({ audience: "internal" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 if incident does not exist", async () => {
      const { token } = await setupOrgWithUser();
      const nonExistentId = new Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/v1/incidents/${nonExistentId}/ai/status-draft`)
        .set("Authorization", `Bearer ${token}`)
        .send({ audience: "internal" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should generate internal status update draft and record suggestion with userDecision='pending'", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const incident = await incidentDao.create({
        title: "Postgres primary failover delayed",
        description: "Replica lag spiked past 5GB during maintenance window",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/status-draft`)
        .set("Authorization", `Bearer ${token}`)
        .send({ audience: "internal" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.STATUS_DRAFT);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.PENDING);
      expect(res.body.data.output.audience).toBe("internal");
      expect(res.body.data.output.draftText.length).toBeGreaterThan(10);
    });

    it("should generate customer-facing status draft following strict public safety rules", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const service = await serviceDao.create({
        name: "billing-gateway",
        tier: 1,
        owningTeam: "Billing Team",
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Billing gateway 502 bad gateway",
        description: "Payment processing degraded on host 10.0.1.42 with DB pool crash",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/status-draft`)
        .set("Authorization", `Bearer ${token}`)
        .send({ audience: "customer" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.output.audience).toBe("customer");
      expect(res.body.data.output.draftText).toBeDefined();

      // Check customer prompt safety: internal host/IP is NEVER present in customer draft output
      expect(res.body.data.output.draftText).not.toContain("10.0.1.42");
    });

    it("should fail open and return null data when AI is disabled", async () => {
      const { org, user, token } = await setupOrgWithUser();
      (config as any).AI_ENABLED = false;

      const incident = await incidentDao.create({
        title: "Test outage",
        description: "Testing fail open behavior",
        priority: INCIDENT_PRIORITY.LOW,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/status-draft`)
        .set("Authorization", `Bearer ${token}`)
        .send({ audience: "internal" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
    });
  });
});

