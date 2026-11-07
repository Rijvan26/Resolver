import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../src/app";
import { config } from "../src/config/config";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { incidentDao } from "../src/dao/incidentDao";
import { serviceDao } from "../src/dao/serviceDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import {
  ROLES,
  Role,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
} from "../src/types";

describe("AI Assistant REST Endpoints (Step 6 / SRS-AI-001)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

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

  // Helper to create an organization with a typed user
  const setupOrgWithUser = async (
    orgName = "Acme SRE",
    slug = "acme-sre",
    role: Role = ROLES.ADMIN
  ) => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: `${role} User`,
      email: `${role.toLowerCase()}-${Date.now()}@${slug}.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: org._id,
      isActive: true,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role,
      email: user.email,
    });

    return { org, user, token };
  };

  const setupIncident = async (
    organizationId: Types.ObjectId,
    createdBy: Types.ObjectId,
    overrides = {}
  ) => {
    return await incidentDao.create({
      title: "Production database failover",
      description: "Replica node promoted after primary heartbeat timeout",
      status: INCIDENT_STATUS.OPEN,
      priority: INCIDENT_PRIORITY.MEDIUM,
      organizationId,
      createdBy,
      ...overrides,
    });
  };

  // ==========================================================================
  // 1. Authentication & Tenant Boundaries
  // ==========================================================================
  describe("Authentication Requirements", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const fakeId = new Types.ObjectId().toString();

      const res1 = await request(app).post(`/api/v1/incidents/${fakeId}/ai/triage`);
      expect(res1.status).toBe(401);

      const res2 = await request(app).post(`/api/v1/incidents/${fakeId}/ai/summary`);
      expect(res2.status).toBe(401);

      const res3 = await request(app).post(`/api/v1/incidents/${fakeId}/ai/postmortem`);
      expect(res3.status).toBe(401);

      const res4 = await request(app).get(`/api/v1/incidents/${fakeId}/ai`);
      expect(res4.status).toBe(401);

      const res5 = await request(app).post(`/api/v1/ai/suggestions/${fakeId}/decision`);
      expect(res5.status).toBe(401);
    });
  });

  // ==========================================================================
  // 2. POST /api/v1/incidents/:id/ai/triage
  // ==========================================================================
  describe("POST /api/v1/incidents/:id/ai/triage", () => {
    it("should trigger triage suggestion and return 200 with suggestion details", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/triage?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.TRIAGE);
      expect(res.body.data.output).toBeDefined();
    });

    it("should prioritize Tier-1 rules and return rule recommendation", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const service = await serviceDao.create({
        name: "checkout-api",
        tier: 1,
        owningTeam: "Checkout Core",
        organizationId: org._id,
      });

      const incident = await setupIncident(org._id, user._id, {
        serviceId: service._id,
        title: "checkout-api is down",
        description: "down",
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/triage?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({ alert: { type: "down" } });

      expect(res.status).toBe(200);
      expect(res.body.data.model).toBe("rules-engine");
      expect(res.body.data.output.suggestedSeverity).toBe("P1");
      expect(res.body.data.output.ruleId).toBe("RULE_TIER1_DOWN");
    });

    it("should return 404 if incident does not exist", async () => {
      const { token } = await setupOrgWithUser();
      const fakeId = new Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/v1/incidents/${fakeId}/ai/triage`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // 3. POST /api/v1/incidents/:id/ai/summary
  // ==========================================================================
  describe("POST /api/v1/incidents/:id/ai/summary", () => {
    it("should generate a status summary and return 200 with summary data", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/summary?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.SUMMARY);
      expect(res.body.data.output.summary).toBeDefined();

      // Check incident subdocument was updated
      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.summary).toBeDefined();
    });

    it("should return 404 for nonexistent incident", async () => {
      const { token } = await setupOrgWithUser();
      const fakeId = new Types.ObjectId().toString();

      const res = await request(app)
        .post(`/api/v1/incidents/${fakeId}/ai/summary`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // 4. POST /api/v1/incidents/:id/ai/postmortem (Strict Resolution Guard)
  // ==========================================================================
  describe("POST /api/v1/incidents/:id/ai/postmortem (Strict Resolution Guard)", () => {
    it("should reject postmortem generation with 400 for OPEN incident", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id, {
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/postmortem`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("resolved or closed");
    });

    it("should reject postmortem generation with 400 for IN_PROGRESS incident", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id, {
        status: INCIDENT_STATUS.IN_PROGRESS,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/postmortem`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain("resolved or closed");
    });

    it("should generate postmortem draft with 200 for RESOLVED incident", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id, {
        status: INCIDENT_STATUS.RESOLVED,
        resolvedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/postmortem?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.POSTMORTEM);
      expect(res.body.data.output.rootCause).toBeDefined();
    });

    it("should generate postmortem draft with 200 for CLOSED incident", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id, {
        status: INCIDENT_STATUS.CLOSED,
        resolvedAt: new Date(),
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/postmortem?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.POSTMORTEM);
    });
  });

  // ==========================================================================
  // 5. GET /api/v1/incidents/:id/ai
  // ==========================================================================
  describe("GET /api/v1/incidents/:id/ai", () => {
    it("should return incident AI metadata, finalSeverity, and latest suggestions", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-triage-123",
        output: { suggestedSeverity: "P2", reason: "Degraded API latency" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${incident._id}/ai`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.finalSeverity).toBeNull();
      expect(res.body.data.aiAccepted).toBe(false);
      expect(res.body.data.suggestions.triage).not.toBeNull();
      expect(res.body.data.suggestions.summary).toBeNull();
    });

    it("should return 404 if incident does not exist", async () => {
      const { token } = await setupOrgWithUser();
      const fakeId = new Types.ObjectId().toString();

      const res = await request(app)
        .get(`/api/v1/incidents/${fakeId}/ai`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  // ==========================================================================
  // 6. POST /api/v1/ai/suggestions/:id/decision (Human-in-the-Loop & RBAC)
  // ==========================================================================
  describe("POST /api/v1/ai/suggestions/:id/decision (RBAC & Hard Rule #1)", () => {
    it("should reject DEVELOPER attempting to accept triage severity with 403 Forbidden", async () => {
      const { org, user: devUser, token: devToken } = await setupOrgWithUser(
        "Dev Corp",
        "dev-corp",
        ROLES.DEVELOPER
      );
      const incident = await setupIncident(org._id, devUser._id);

      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "dev-forbidden-hash",
        output: { suggestedSeverity: "P1", reason: "Critical DB failure" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      // Developer tries to accept triage
      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ decision: AI_USER_DECISION.ACCEPTED });

      expect(res.status).toBe(403);
      expect(res.body.error.message).toContain("Only Managers, Admins, or Super Admins");
    });

    it("should allow MANAGER to accept triage severity and set incident.finalSeverity", async () => {
      const { org, user: mgrUser, token: mgrToken } = await setupOrgWithUser(
        "Mgr Corp",
        "mgr-corp",
        ROLES.MANAGER
      );
      const incident = await setupIncident(org._id, mgrUser._id, {
        priority: INCIDENT_PRIORITY.LOW,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "mgr-accept-hash",
        output: { suggestedSeverity: "P1", reason: "Critical system outage" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${mgrToken}`)
        .send({ decision: AI_USER_DECISION.ACCEPTED });

      expect(res.status).toBe(200);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.ACCEPTED);

      // HARD RULE #1: Accepting triage is the ONLY way ai.severity becomes finalSeverity
      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updatedIncident!.finalSeverity).toBe("CRITICAL");
      expect(updatedIncident!.priority).toBe("CRITICAL");
      expect(updatedIncident!.aiAccepted).toBe(true);
    });

    it("should allow ADMIN to edit triage severity and update incident.finalSeverity", async () => {
      const { org, user: adminUser, token: adminToken } = await setupOrgWithUser(
        "Admin Corp",
        "admin-corp",
        ROLES.ADMIN
      );
      const incident = await setupIncident(org._id, adminUser._id, {
        priority: INCIDENT_PRIORITY.LOW,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "admin-edit-hash",
        output: { suggestedSeverity: "P1", reason: "High load" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          decision: AI_USER_DECISION.EDITED,
          editedOutput: { suggestedSeverity: "P2", reason: "Downgraded to P2: backup server active" },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.EDITED);

      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updatedIncident!.finalSeverity).toBe("HIGH"); // P2 maps to HIGH
      expect(updatedIncident!.priority).toBe("HIGH");
      expect(updatedIncident!.aiAccepted).toBe(true);
    });

    it("should record dismissed decision WITHOUT modifying incident.finalSeverity", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id, {
        priority: INCIDENT_PRIORITY.LOW,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "dismiss-hash",
        output: { suggestedSeverity: "P1", reason: "Critical" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: AI_USER_DECISION.DISMISSED });

      expect(res.status).toBe(200);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.DISMISSED);

      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updatedIncident!.finalSeverity).toBeNull();
      expect(updatedIncident!.priority).toBe(INCIDENT_PRIORITY.LOW);
      expect(updatedIncident!.aiAccepted).toBe(false);
    });

    it("should return 400 Bad Request for invalid decision value", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "bad-decision-hash",
        output: { suggestedSeverity: "P2" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "invalid_decision" });

      expect(res.status).toBe(400);
    });

    it("should return 404 if user attempts to decide on cross-org suggestion", async () => {
      const { org: org1, user: user1 } = await setupOrgWithUser("Org One", "org-one");
      const { token: token2 } = await setupOrgWithUser("Org Two", "org-two");

      const incident = await setupIncident(org1._id, user1._id);
      const suggestion = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org1._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "cross-org-hash",
        output: { suggestedSeverity: "P2" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      // User from Org Two attempts to decide on Org One's suggestion
      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${token2}`)
        .send({ decision: AI_USER_DECISION.ACCEPTED });

      expect(res.status).toBe(404);
    });
  });
});
