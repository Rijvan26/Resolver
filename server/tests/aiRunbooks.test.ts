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
import { runbookDao } from "../src/dao/runbookDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { FakeEmbeddingProvider } from "../src/services/ai/embeddings/fakeEmbeddingProvider";
import * as embeddingFactory from "../src/services/ai/embeddings";
import {
  ROLES,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  AI_USER_DECISION,
} from "../src/types";

describe("Checkpoint B: Runbook Suggestions (FR-11)", () => {
  let fakeEmbeddingProvider: FakeEmbeddingProvider;

  beforeAll(async () => {
    await setupTestDb();
  }, 60000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.restoreAllMocks();

    fakeEmbeddingProvider = new FakeEmbeddingProvider();
    vi.spyOn(embeddingFactory, "getEmbeddingProvider").mockReturnValue(fakeEmbeddingProvider);

    (config as any).AI_ENABLED = true;
    (config as any).AI_RUNBOOK_ENABLED = true;
    (config as any).AI_RUNBOOK_EXPLANATION_ENABLED = false; // default off
    (config as any).AI_PROVIDER = "fake";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupTestEnv = async () => {
    const org = await organizationDao.create({ name: "Runbook Corp", slug: `rb-${Date.now()}` });
    const user = await userDao.create({
      name: "SRE Operator",
      email: `sre-${Date.now()}@runbook.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role: ROLES.ADMIN,
      organizationId: org._id,
      isActive: true,
    });

    const paymentService = await serviceDao.create({
      name: "Payment Gateway",
      tier: 1,
      owningTeam: "Payments Team",
      organizationId: org._id,
      runbookLinks: ["https://wiki.internal/runbooks/payments/default"],
    });

    const authService = await serviceDao.create({
      name: "Auth Core",
      tier: 1,
      owningTeam: "Security Team",
      organizationId: org._id,
      runbookLinks: ["https://wiki.internal/runbooks/auth/default"],
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role: user.role,
    });

    return { org, user, paymentService, authService, token };
  };

  describe("1. Retrieval First & Multi-factor Ranking", () => {
    it("should prioritize runbooks matching the incident service and relevant keywords/tags", async () => {
      const { org, user, paymentService, authService, token } = await setupTestEnv();

      // Create a variety of runbooks
      // Runbook 1: Same service + matching tags
      const rb1 = await runbookDao.create({
        title: "Payment Gateway Latency & Timeout Mitigation",
        url: "https://wiki.internal/runbooks/payments/latency-mitigation",
        tags: ["payments", "timeout", "latency", "gateway"],
        serviceId: paymentService._id,
        organizationId: org._id,
        description: "Steps to mitigate elevated 504 gateway timeouts on payment routes",
      });

      // Runbook 2: Same service but generic tags
      const rb2 = await runbookDao.create({
        title: "Payment Gateway Routine Maintenance",
        url: "https://wiki.internal/runbooks/payments/maintenance",
        tags: ["payments", "maintenance"],
        serviceId: paymentService._id,
        organizationId: org._id,
        description: "Scheduled certificate rotation and maintenance procedures",
      });

      // Runbook 3: Different service, generic
      await runbookDao.create({
        title: "Auth Core Token Rotation",
        url: "https://wiki.internal/runbooks/auth/tokens",
        tags: ["auth", "jwt"],
        serviceId: authService._id,
        organizationId: org._id,
        description: "Procedures for emergency signing key rotation",
      });

      // Runbook 4: Unrelated service but matching keywords
      const rb4 = await runbookDao.create({
        title: "Network Gateway Timeout Diagnostic",
        url: "https://wiki.internal/runbooks/infra/gateway-timeout",
        tags: ["gateway", "timeout", "network"],
        organizationId: org._id,
        description: "General diagnostic for edge gateway timeouts",
      });

      // Create an incident for Payment Gateway experiencing timeouts
      const incident = await incidentDao.create({
        title: "Payment Gateway 504 Gateway Timeout Surge",
        description: "Payment gateway experiencing elevated timeout latency and customer request drops",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.aiAvailable).toBe(true);
      expect(res.body.data.runbooks.length).toBeLessThanOrEqual(3);

      const topRunbooks = res.body.data.runbooks;
      expect(topRunbooks.length).toBeGreaterThan(0);

      // Top runbook should be rb1 (same service + matching tags)
      expect(topRunbooks[0].url).toBe(rb1.url);
      expect(topRunbooks[0].score).toBeGreaterThan(topRunbooks[1].score);
      expect(topRunbooks[0].reason).toContain("Payment Gateway");
    });

    it("should include runbooks synthesized from Service.runbookLinks", async () => {
      const { org, user, paymentService, token } = await setupTestEnv();

      // Incident for Payment Gateway without explicit Runbook documents in database
      const incident = await incidentDao.create({
        title: "Payment Gateway Outage",
        description: "Payment service unavailable",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.runbooks.length).toBe(1);
      expect(res.body.data.runbooks[0].url).toBe("https://wiki.internal/runbooks/payments/default");
      expect(res.body.data.runbooks[0].title).toContain("Payment Gateway");
    });

    it("should never return more than top 3 runbooks", async () => {
      const { org, user, paymentService, token } = await setupTestEnv();

      // Create 5 runbooks
      for (let i = 1; i <= 5; i++) {
        await runbookDao.create({
          title: `Payment Procedure #${i}`,
          url: `https://wiki.internal/runbooks/payments/${i}`,
          tags: ["payments", "procedure"],
          serviceId: paymentService._id,
          organizationId: org._id,
        });
      }

      const incident = await incidentDao.create({
        title: "Payment Processing Delays",
        description: "Transactions queued in payment pipeline",
        priority: INCIDENT_PRIORITY.MEDIUM,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.runbooks.length).toBe(3);
    });
  });

  describe("2. No Invented Runbooks & Isolation", () => {
    it("should only return runbooks that exist in the caller's organization data", async () => {
      const { org, user, token } = await setupTestEnv();

      // Other org's runbook
      const otherOrg = await organizationDao.create({ name: "Other Corp", slug: `other-${Date.now()}` });
      await runbookDao.create({
        title: "Confidential Competitor Runbook",
        url: "https://wiki.competitor.com/secret",
        tags: ["secret"],
        organizationId: otherOrg._id,
      });

      const incident = await incidentDao.create({
        title: "Database Outage",
        description: "Postgres unreachable",
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      // Must not leak other org's runbook
      const urls = res.body.data.runbooks.map((r: any) => r.url);
      expect(urls).not.toContain("https://wiki.competitor.com/secret");
    });

    it("should gracefully return empty list when no runbooks match or exist", async () => {
      const { org, user, token } = await setupTestEnv();

      // Service with NO runbookLinks
      const serviceNoLinks = await serviceDao.create({
        name: "Legacy Internal Service",
        tier: 3,
        owningTeam: "Legacy Team",
        organizationId: org._id,
        runbookLinks: [],
      });

      const incident = await incidentDao.create({
        title: "Legacy Service Glitch",
        description: "Occasional glitch",
        priority: INCIDENT_PRIORITY.LOW,
        serviceId: serviceNoLinks._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.aiAvailable).toBe(true);
      expect(res.body.data.runbooks).toEqual([]);
    });
  });

  describe("3. Feature Toggles & LLM Step", () => {
    it("should return aiAvailable: false with reason: disabled when feature is toggled off", async () => {
      const { org, user, token } = await setupTestEnv();
      (config as any).AI_RUNBOOK_ENABLED = false;

      const incident = await incidentDao.create({
        title: "Test Outage",
        description: "Testing toggle",
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.aiAvailable).toBe(false);
      expect(res.body.data.reason).toBe("disabled");
      expect(res.body.data.runbooks).toEqual([]);
    });

    it("should generate LLM explanations when AI_RUNBOOK_EXPLANATION_ENABLED is true", async () => {
      const { org, user, paymentService, token } = await setupTestEnv();
      (config as any).AI_RUNBOOK_EXPLANATION_ENABLED = true;

      await runbookDao.create({
        title: "Payment Gateway Failure Recovery",
        url: "https://wiki.internal/runbooks/payments/recovery",
        tags: ["payments", "recovery"],
        serviceId: paymentService._id,
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Payment Gateway Outage",
        description: "Payment service outage",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.runbooks.length).toBeGreaterThan(0);
      expect(res.body.data.runbooks[0].explanation).toBeDefined();
      expect(typeof res.body.data.runbooks[0].explanation).toBe("string");
    });
  });

  describe("4. Human Feedback (Useful / Not Useful)", () => {
    it("should record user feedback in ai_suggestions audit log", async () => {
      const { org, user, paymentService, token } = await setupTestEnv();

      await runbookDao.create({
        title: "Payment Failover Runbook",
        url: "https://wiki.internal/runbooks/payments/failover",
        tags: ["payments", "failover"],
        serviceId: paymentService._id,
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Payment Gateway Down",
        description: "Needs failover",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Get suggested runbooks (creates suggestion in ai_suggestions)
      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      const suggestionId = res.body.data.suggestionId;
      expect(suggestionId).toBeDefined();

      // Submit "useful" feedback
      const fbRes = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/runbooks/feedback`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          suggestionId,
          feedback: "useful",
        });

      expect(fbRes.status).toBe(200);
      expect(fbRes.body.success).toBe(true);

      // Verify recorded in ai_suggestions
      const suggestion = await aiSuggestionDao.findById(suggestionId);
      expect(suggestion?.userDecision).toBe(AI_USER_DECISION.ACCEPTED);
      const decidedById = (suggestion?.decidedBy as any)?._id
        ? (suggestion!.decidedBy as any)._id.toString()
        : suggestion?.decidedBy?.toString();
      expect(decidedById).toBe(user._id.toString());
    });
  });

  describe("5. Integrity & Non-Hallucination Guarantees", () => {
    it("should NEVER return or invent a runbook that does not exist in the database", async () => {
      const { org, user, paymentService, token } = await setupTestEnv();

      // Only create 2 specific runbooks in the database
      const rb1 = await runbookDao.create({
        title: "Exact Existing Runbook One",
        url: "https://wiki.acme.corp/runbook-1",
        tags: ["database", "postgres"],
        serviceId: paymentService._id,
        organizationId: org._id,
      });

      const rb2 = await runbookDao.create({
        title: "Exact Existing Runbook Two",
        url: "https://wiki.acme.corp/runbook-2",
        tags: ["payments", "checkout"],
        serviceId: paymentService._id,
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Database latency and checkout failures",
        description: "Postgres primary database response time degraded",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: paymentService._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Enable explanation LLM step
      (config as any).AI_RUNBOOK_EXPLANATION_ENABLED = true;

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai/runbooks`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const returnedRunbooks = res.body.data.runbooks;
      const validUrls = [rb1.url, rb2.url, ...(paymentService.runbookLinks || [])];

      // Verify EVERY returned runbook strictly corresponds to an existing record
      expect(returnedRunbooks.length).toBeGreaterThan(0);
      for (const item of returnedRunbooks) {
        expect(validUrls).toContain(item.url);
      }
    });
  });
});
