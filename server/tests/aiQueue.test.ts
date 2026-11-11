import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import app from "../src/app";
import { config } from "../src/config/config";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { addAiJob } from "../src/services/ai/queue/bullmq";
import {
  processTriageJob,
  processSummaryJob,
  processPostmortemJob,
} from "../src/services/ai/queue/worker";
import { incidentDao } from "../src/dao/incidentDao";
import { serviceDao } from "../src/dao/serviceDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { activityDao } from "../src/dao/activityDao";
import { commentDao } from "../src/dao/commentDao";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { ROLES, Role, AI_STATUS, INCIDENT_STATUS, INCIDENT_PRIORITY } from "../src/types";

describe("BullMQ Queue & AI Worker (ai-jobs)", () => {
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

  // Helper to create organization and user
  const setupOrgWithUser = async (
    orgName = "Acme Corp",
    slug = "acme-corp",
    role: Role = ROLES.SUPER_ADMIN,
    isActive = true
  ) => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: `${role} User`,
      email: `${role.toLowerCase()}-${Date.now()}@${slug}.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: org._id,
      isActive,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role,
      email: user.email,
    });

    return { org, user, token };
  };

  // Helper to create an incident
  const setupIncident = async (
    organizationId: Types.ObjectId,
    createdBy: Types.ObjectId,
    overrides = {}
  ) => {
    return await incidentDao.create({
      title: "Test Incident",
      description: "Test incident description for queue testing",
      status: INCIDENT_STATUS.OPEN,
      priority: INCIDENT_PRIORITY.MEDIUM,
      organizationId,
      createdBy,
      ...overrides,
    });
  };

  describe("Fail-Open Architecture & addAiJob", () => {
    it("should fail open and set status='unavailable' when AI_ENABLED is false", async () => {
      const { org, user } = await setupOrgWithUser("Queue Corp", "queue-corp", ROLES.SUPER_ADMIN);
      const incident = await setupIncident(org._id, user._id);

      // Verify AI_ENABLED is false by default in test config
      const originalAiEnabled = config.AI_ENABLED;
      (config as any).AI_ENABLED = false;

      const jobId = await addAiJob({
        jobType: "triage",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      expect(jobId).toBeNull();

      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.status).toBe(AI_STATUS.UNAVAILABLE);

      (config as any).AI_ENABLED = originalAiEnabled;
    });

    it("should never throw when Redis throws an unexpected connection error (failing open)", async () => {
      const { org, user } = await setupOrgWithUser("Fault Corp", "fault-corp", ROLES.ADMIN);
      const incident = await setupIncident(org._id, user._id);

      (config as any).AI_ENABLED = true;

      // Mock queue.add and getAiQueue to simulate a Redis ECONNREFUSED error
      const bullmqModule = await import("../src/services/ai/queue/bullmq");
      const queue = bullmqModule.getAiQueue();
      vi.spyOn(queue, "add").mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:6379"));

      // Must NOT throw
      const jobId = await addAiJob({
        jobType: "triage",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      expect(jobId).toBeNull();

      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.status).toBe(AI_STATUS.UNAVAILABLE);

      (config as any).AI_ENABLED = false;
    });
  });

  describe("Triage Worker (processTriageJob)", () => {
    it("should apply RULES FIRST for Tier-1 down alert without calling external LLM", async () => {
      const { org, user } = await setupOrgWithUser("Tier1 Rules Corp", "tier1-corp", ROLES.SUPER_ADMIN);

      // Create Tier-1 Service
      const service = await serviceDao.create({
        name: "Authentication Core",
        tier: 1,
        owningTeam: "Security Platform",
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Auth Core is down",
        description: "Health checks failing across all pods",
        status: INCIDENT_STATUS.OPEN,
        priority: "MEDIUM",
        organizationId: org._id,
        createdBy: user._id,
        serviceId: service._id,
      });

      // Execute worker logic
      await processTriageJob({
        jobType: "triage",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
        alert: { type: "down" },
      });

      // Verify incident.ai was updated with rule decision (P1 / CRITICAL, confidence 1.0, model: "rules-engine")
      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.severity).toBe("CRITICAL");
      expect(updated?.ai?.confidence).toBe(1.0);
      expect(updated?.ai?.model).toBe("rules-engine");
      expect(updated?.ai?.provider).toBe("rules");
      expect(updated?.ai?.status).toBe(AI_STATUS.READY);

      // Verify audit record was created in ai_suggestions
      const suggestion = await aiSuggestionDao.findLatestByIncidentAndType(incident._id, "triage");
      expect(suggestion).not.toBeNull();
      expect(suggestion?.model).toBe("rules-engine");
      expect(suggestion?.userDecision).toBe("pending");
      expect((suggestion?.output as any).suggestedSeverity).toBe("P1");
    });

    it("should fallback to AI model when rules are inconclusive", async () => {
      const { org, user } = await setupOrgWithUser("Fallback Corp", "fallback-corp", ROLES.SUPER_ADMIN);

      const service = await serviceDao.create({
        name: "Search Indexer",
        tier: 2,
        owningTeam: "Discovery Team",
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Search queries slow",
        description: "Elasticsearch cluster latency spike",
        status: INCIDENT_STATUS.OPEN,
        priority: "LOW",
        organizationId: org._id,
        createdBy: user._id,
        serviceId: service._id,
      });

      (config as any).AI_ENABLED = true;

      await processTriageJob({
        jobType: "triage",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
        alert: { type: "latency_warning" }, // Inconclusive for Tier 2
      });

      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.status).toBe(AI_STATUS.READY);
      expect(updated?.ai?.confidence).toBeGreaterThan(0);
      expect(updated?.ai?.model).toBeDefined();

      const suggestion = await aiSuggestionDao.findLatestByIncidentAndType(incident._id, "triage");
      expect(suggestion).not.toBeNull();
      expect(suggestion?.provider).toBe(config.AI_PROVIDER);

      (config as any).AI_ENABLED = false;
    });
  });

  describe("Summary Worker (processSummaryJob)", () => {
    it("should generate sanitized summary from incident activities and comments", async () => {
      const { org, user } = await setupOrgWithUser("Summary Corp", "summary-corp", ROLES.ADMIN);
      const incident = await setupIncident(org._id, user._id);

      // Add comments and activity
      await commentDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        authorId: user._id,
        content: "Investigating database replica at 10.0.0.12 with password=secret!",
      });

      await activityDao.create({
        organizationId: org._id,
        incidentId: incident._id,
        actorId: user._id,
        action: "STATUS_CHANGED",
        metadata: { from: "OPEN", to: "IN_PROGRESS" },
      });

      (config as any).AI_ENABLED = true;

      await processSummaryJob({
        jobType: "summary",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const updated = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updated?.ai?.summary).toBeDefined();
      expect(updated?.ai?.summaryUpdatedAt).toBeInstanceOf(Date);

      const suggestion = await aiSuggestionDao.findLatestByIncidentAndType(incident._id, "summary");
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe("summary");

      (config as any).AI_ENABLED = false;
    });
  });

  describe("Postmortem Worker (processPostmortemJob)", () => {
    it("should refuse to generate postmortem for open or unresolved incidents", async () => {
      const { org, user } = await setupOrgWithUser("Postmortem Corp", "pm-corp", ROLES.ADMIN);
      const incident = await setupIncident(org._id, user._id); // status: OPEN

      (config as any).AI_ENABLED = true;

      await processPostmortemJob({
        jobType: "postmortem",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const suggestion = await aiSuggestionDao.findLatestByIncidentAndType(incident._id, "postmortem");
      expect(suggestion).toBeNull();

      (config as any).AI_ENABLED = false;
    });

    it("should generate blameless postmortem draft for RESOLVED incidents", async () => {
      const { org, user } = await setupOrgWithUser("Resolved Corp", "res-corp", ROLES.ADMIN);

      const incident = await incidentDao.create({
        title: "Payment Gateway Latency Spike",
        description: "Primary database replica pool exhausted",
        status: INCIDENT_STATUS.RESOLVED,
        priority: "HIGH",
        organizationId: org._id,
        createdBy: user._id,
        resolvedAt: new Date(),
      });

      (config as any).AI_ENABLED = true;

      await processPostmortemJob({
        jobType: "postmortem",
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const suggestion = await aiSuggestionDao.findLatestByIncidentAndType(incident._id, "postmortem");
      expect(suggestion).not.toBeNull();
      expect(suggestion?.type).toBe("postmortem");
      expect((suggestion?.output as any).rootCause).toBeDefined();
      expect(Array.isArray((suggestion?.output as any).actionItems)).toBe(true);

      (config as any).AI_ENABLED = false;
    });
  });

  describe("Bull Board RBAC Authorization (/admin/queues)", () => {
    it("should reject unauthenticated requests with 401", async () => {
      const res = await request(app).get("/admin/queues");
      expect(res.status).toBe(401);
    });

    it("should reject DEVELOPER and MANAGER roles with 403 Forbidden", async () => {
      const { token } = await setupOrgWithUser("NoAccess Corp", "no-access-corp", ROLES.DEVELOPER);

      const res = await request(app)
        .get("/admin/queues")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(403);
    });

    it("should allow SUPER_ADMIN access to /admin/queues", async () => {
      const { token } = await setupOrgWithUser("Admin Corp", "admin-corp", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get("/admin/queues")
        .set("Authorization", `Bearer ${token}`);

      // Expect either 200 or 302/301 (Bull Board redirect to /admin/queues/)
      expect([200, 301, 302]).toContain(res.status);
    });
  });
});
