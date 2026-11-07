import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { incidentDao } from "../src/dao/incidentDao";
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

describe("AI Audit Log & Operational Telemetry (Step 8 / FR-14)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  const setupIncident = async (organizationId: Types.ObjectId, createdBy: Types.ObjectId) => {
    return await incidentDao.create({
      title: "Kubernetes pod OOMKilled",
      description: "Memory threshold breached on worker deployment",
      status: INCIDENT_STATUS.OPEN,
      priority: INCIDENT_PRIORITY.HIGH,
      organizationId,
      createdBy,
    });
  };

  // ==========================================================================
  // 1. Authentication & RBAC Authorization
  // ==========================================================================
  describe("Authentication & RBAC Permissions", () => {
    it("should reject unauthenticated request with 401 Unauthorized", async () => {
      const res = await request(app).get("/api/v1/ai/audit");
      expect(res.status).toBe(401);
    });

    it("should reject DEVELOPER with 403 Forbidden", async () => {
      const { token } = await setupOrgWithUser("Dev Corp", "dev-corp", ROLES.DEVELOPER);
      const res = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("should reject MANAGER with 403 Forbidden", async () => {
      const { token } = await setupOrgWithUser("Mgr Corp", "mgr-corp", ROLES.MANAGER);
      const res = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("should permit ADMIN with 200 OK", async () => {
      const { token } = await setupOrgWithUser("Admin Corp", "admin-corp", ROLES.ADMIN);
      const res = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it("should permit SUPER_ADMIN with 200 OK", async () => {
      const { token } = await setupOrgWithUser("Super Corp", "super-corp", ROLES.SUPER_ADMIN);
      const res = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ==========================================================================
  // 2. Multi-Tenant Isolation
  // ==========================================================================
  describe("Multi-Tenant Isolation", () => {
    it("should strictly scope audit suggestions to authenticated organization", async () => {
      const { org: org1, user: user1, token: token1 } = await setupOrgWithUser("Org One", "org-one", ROLES.ADMIN);
      const { org: org2, user: user2, token: token2 } = await setupOrgWithUser("Org Two", "org-two", ROLES.ADMIN);

      const incident1 = await setupIncident(org1._id, user1._id);
      const incident2 = await setupIncident(org2._id, user2._id);

      // Create suggestion for Org 1
      await aiSuggestionDao.create({
        incidentId: incident1._id,
        organizationId: org1._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-org1",
        output: { suggestedSeverity: "P1" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      // Create suggestion for Org 2
      await aiSuggestionDao.create({
        incidentId: incident2._id,
        organizationId: org2._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-org2",
        output: { suggestedSeverity: "P2" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      // Org 1 audit
      const res1 = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token1}`);

      expect(res1.status).toBe(200);
      expect(res1.body.data.suggestions.length).toBe(1);
      expect(res1.body.data.suggestions[0].inputHash).toBe("hash-org1");
      expect(res1.body.data.metrics.totalSuggestions).toBe(1);

      // Org 2 audit
      const res2 = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token2}`);

      expect(res2.status).toBe(200);
      expect(res2.body.data.suggestions.length).toBe(1);
      expect(res2.body.data.suggestions[0].inputHash).toBe("hash-org2");
      expect(res2.body.data.metrics.totalSuggestions).toBe(1);
    });
  });

  // ==========================================================================
  // 3. Filtering & Pagination
  // ==========================================================================
  describe("Filtering & Pagination", () => {
    it("should filter audit logs by suggestion type", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-triage",
        output: { suggestedSeverity: "P1" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.SUMMARY,
        inputHash: "hash-summary",
        output: { summary: "Incident investigation ongoing" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const res = await request(app)
        .get(`/api/v1/ai/audit?type=${AI_SUGGESTION_TYPE.TRIAGE}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions.length).toBe(1);
      expect(res.body.data.suggestions[0].type).toBe(AI_SUGGESTION_TYPE.TRIAGE);
    });

    it("should filter audit logs by userDecision", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      const sugg1 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-pending",
        output: { suggestedSeverity: "P1" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      const sugg2 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-accepted",
        output: { suggestedSeverity: "P2" },
        model: "fake-model",
        provider: "fake",
        status: "ready",
      });

      await aiSuggestionDao.updateDecisionByOrgAndId(
        org._id,
        sugg2._id,
        AI_USER_DECISION.ACCEPTED,
        user._id
      );

      const res = await request(app)
        .get(`/api/v1/ai/audit?decision=${AI_USER_DECISION.ACCEPTED}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.suggestions.length).toBe(1);
      expect(res.body.data.suggestions[0].userDecision).toBe(AI_USER_DECISION.ACCEPTED);
    });

    it("should paginate results correctly", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      for (let i = 0; i < 7; i++) {
        await aiSuggestionDao.create({
          incidentId: incident._id,
          organizationId: org._id,
          type: AI_SUGGESTION_TYPE.TRIAGE,
          inputHash: `hash-page-${i}`,
          output: { suggestedSeverity: "P2" },
          model: "fake-model",
          provider: "fake",
          status: "ready",
        });
      }

      const res = await request(app)
        .get("/api/v1/ai/audit?page=2&limit=4")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(4);
      expect(res.body.data.pagination.total).toBe(7);
      expect(res.body.data.pagination.totalPages).toBe(2);
      expect(res.body.data.suggestions.length).toBe(3); // 7 - 4 = 3 on page 2
    });
  });

  // ==========================================================================
  // 4. Telemetry Metrics & Agreement Rate Calculation (FR-14)
  // ==========================================================================
  describe("Telemetry Metrics & Agreement Rate Calculation", () => {
    it("should accurately compute agreement rate and latency telemetry", async () => {
      const { org, user, token } = await setupOrgWithUser();
      const incident = await setupIncident(org._id, user._id);

      // 1. Accepted (model matched human intent) - latency 100ms
      const s1 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-metric-1",
        output: { suggestedSeverity: "P1" },
        model: "fake-model",
        provider: "fake",
        latencyMs: 100,
        status: "ready",
      });
      await aiSuggestionDao.updateDecisionByOrgAndId(org._id, s1._id, AI_USER_DECISION.ACCEPTED, user._id);

      // 2. Accepted - latency 200ms
      const s2 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-metric-2",
        output: { suggestedSeverity: "P2" },
        model: "fake-model",
        provider: "fake",
        latencyMs: 200,
        status: "ready",
      });
      await aiSuggestionDao.updateDecisionByOrgAndId(org._id, s2._id, AI_USER_DECISION.ACCEPTED, user._id);

      // 3. Edited (human adjusted severity) - latency 300ms
      const s3 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-metric-3",
        output: { suggestedSeverity: "P1" },
        model: "fake-model",
        provider: "fake",
        latencyMs: 300,
        status: "ready",
      });
      await aiSuggestionDao.updateDecisionByOrgAndId(
        org._id,
        s3._id,
        AI_USER_DECISION.EDITED,
        user._id,
        { suggestedSeverity: "P2" }
      );

      // 4. Dismissed (human rejected) - latency 400ms
      const s4 = await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-metric-4",
        output: { suggestedSeverity: "P4" },
        model: "fake-model",
        provider: "fake",
        latencyMs: 400,
        status: "ready",
      });
      await aiSuggestionDao.updateDecisionByOrgAndId(org._id, s4._id, AI_USER_DECISION.DISMISSED, user._id);

      // 5. Pending (unresolved) - latency 500ms
      await aiSuggestionDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        type: AI_SUGGESTION_TYPE.TRIAGE,
        inputHash: "hash-metric-5",
        output: { suggestedSeverity: "P3" },
        model: "fake-model",
        provider: "fake",
        latencyMs: 500,
        status: "ready",
      });

      const res = await request(app)
        .get("/api/v1/ai/audit")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);

      const metrics = res.body.data.metrics;
      expect(metrics.totalSuggestions).toBe(5);
      expect(metrics.acceptedCount).toBe(2);
      expect(metrics.editedCount).toBe(1);
      expect(metrics.dismissedCount).toBe(1);
      expect(metrics.pendingCount).toBe(1);

      // Decided: 2 accepted + 1 edited + 1 dismissed = 4 decided
      // Agreement Rate = 2 / 4 = 50.0%
      expect(metrics.agreementRate).toBe(50);

      // Average latency = (100 + 200 + 300 + 400 + 500) / 5 = 300ms
      expect(metrics.avgLatencyMs).toBe(300);
    });
  });
});

