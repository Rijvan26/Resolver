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
import { incidentEmbeddingDao } from "../src/dao/incidentEmbeddingDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { aiService } from "../src/services/ai/aiService";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { FakeEmbeddingProvider } from "../src/services/ai/embeddings/fakeEmbeddingProvider";
import { Incident } from "../src/models/Incident";
import {
  ROLES,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
} from "../src/types";

describe("AI Step 3: Duplicate Detection (FR-06)", () => {
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
    (config as any).EMBEDDING_PROVIDER = "fake";
    (config as any).AI_DUPLICATE_THRESHOLD = 0.70;
    (config as any).AI_DUPLICATE_WINDOW_HOURS = 24;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupOrgWithUser = async (orgName = "Acme Corp", slug = "acme-corp") => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: "Incident Commander",
      email: `ic-${Date.now()}@${slug}.com`,
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

  describe("1. aiService.detectDuplicates Core Detection Logic", () => {
    it("should return null if target incident is already RESOLVED or CLOSED", async () => {
      const { org, user } = await setupOrgWithUser();

      const resolved = await incidentDao.create({
        title: "Database latency spike",
        description: "Billing DB slow queries",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.RESOLVED,
        organizationId: org._id,
        createdBy: user._id,
      });

      const suggestion = await aiService.detectDuplicates(resolved._id, org._id);
      expect(suggestion).toBeNull();
    });

    it("should return null if no other open incidents exist in the same organization", async () => {
      const { org, user } = await setupOrgWithUser();

      const singleIncident = await incidentDao.create({
        title: "Auth Redis pool drained",
        description: "Pool size exceeded max connections",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const suggestion = await aiService.detectDuplicates(singleIncident._id, org._id);
      expect(suggestion).toBeNull();
    });

    it("should ignore open incidents outside the configured time window (e.g. older than 24h)", async () => {
      const { org, user } = await setupOrgWithUser();

      const service = await serviceDao.create({
        name: "payment-gw",
        tier: 1,
        owningTeam: "Payments Team",
        organizationId: org._id,
      });

      // Candidate incident created 30 hours ago
      const oldIncident = await incidentDao.create({
        title: "Payment gateway timeout",
        description: "Charges failing with 504",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Manually shift createdAt backwards by 30 hours using raw collection update
      await Incident.collection.updateOne(
        { _id: oldIncident._id },
        { $set: { createdAt: new Date(Date.now() - 30 * 60 * 60 * 1000) } }
      );

      const newIncident = await incidentDao.create({
        title: "Payment gateway timeout",
        description: "Charges failing with 504",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const resEmb = await fakeProvider.embed(["Payment gateway timeout"]);

      await incidentEmbeddingDao.upsert({
        incidentId: oldIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: newIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const suggestion = await aiService.detectDuplicates(newIncident._id, org._id);
      expect(suggestion).toBeNull();
    });

    it("should ignore candidate incidents belonging to a different service", async () => {
      const { org, user } = await setupOrgWithUser();

      const serviceA = await serviceDao.create({
        name: "cart-service",
        tier: 1,
        owningTeam: "Cart Team",
        organizationId: org._id,
      });

      const serviceB = await serviceDao.create({
        name: "inventory-service",
        tier: 1,
        owningTeam: "Inventory Team",
        organizationId: org._id,
      });

      const existingIncident = await incidentDao.create({
        title: "High error rate in cart-service",
        description: "Redis socket timeout",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: serviceA._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const newIncident = await incidentDao.create({
        title: "High error rate in inventory-service",
        description: "Redis socket timeout",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: serviceB._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const resEmb = await fakeProvider.embed(["Redis socket timeout"]);

      await incidentEmbeddingDao.upsert({
        incidentId: existingIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: newIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const suggestion = await aiService.detectDuplicates(newIncident._id, org._id);
      expect(suggestion).toBeNull();
    });

    it("should create duplicate suggestion when similarity >= threshold on same service within time window", async () => {
      const { org, user } = await setupOrgWithUser();

      const service = await serviceDao.create({
        name: "checkout-api",
        tier: 1,
        owningTeam: "Checkout Team",
        organizationId: org._id,
      });

      const existingIncident = await incidentDao.create({
        title: "Stripe checkout failing with 500",
        description: "Payments API returned 500 Internal Server Error",
        priority: INCIDENT_PRIORITY.CRITICAL,
        status: INCIDENT_STATUS.OPEN,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const newIncident = await incidentDao.create({
        title: "Stripe checkout failing with 500",
        description: "Payments API returned 500 Internal Server Error",
        priority: INCIDENT_PRIORITY.CRITICAL,
        status: INCIDENT_STATUS.OPEN,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const resEmb = await fakeProvider.embed(["Stripe checkout failing with 500"]);

      await incidentEmbeddingDao.upsert({
        incidentId: existingIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: newIncident._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const suggestion = await aiService.detectDuplicates(newIncident._id, org._id);

      expect(suggestion).toBeDefined();
      expect(suggestion!.type).toBe(AI_SUGGESTION_TYPE.DUPLICATE);
      expect(suggestion!.userDecision).toBe(AI_USER_DECISION.PENDING);

      const output = suggestion!.output as any;
      expect(output.bestMatchIncidentId).toBe(existingIncident._id.toString());
      expect(output.bestMatchScore).toBe(1.0);
      expect(output.candidateIncidentIds).toContain(existingIncident._id.toString());

      // HARD RULE #1 Check: No automatic merging occurred!
      const afterIncident = await incidentDao.findByOrgAndId(org._id, newIncident._id);
      expect(afterIncident!.status).toBe(INCIDENT_STATUS.OPEN);
      expect(afterIncident!.duplicateOf).toBeFalsy();
    });

    it("should strictly enforce multi-tenant isolation (never match open incidents from another org)", async () => {
      const { org: org1, user: user1 } = await setupOrgWithUser("Org One", "org-one");
      const { org: org2, user: user2 } = await setupOrgWithUser("Org Two", "org-two");

      const inc1 = await incidentDao.create({
        title: "Elasticsearch disk 99% full",
        description: "Read only cluster state",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org1._id,
        createdBy: user1._id,
      });

      const inc2 = await incidentDao.create({
        title: "Elasticsearch disk 99% full",
        description: "Read only cluster state",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org2._id,
        createdBy: user2._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const resEmb = await fakeProvider.embed(["Elasticsearch disk 99% full"]);

      await incidentEmbeddingDao.upsert({
        incidentId: inc1._id,
        organizationId: org1._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: inc2._id,
        organizationId: org2._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const suggestion = await aiService.detectDuplicates(inc2._id, org2._id);
      expect(suggestion).toBeNull();
    });
  });

  describe("2. Decision Endpoint: POST /api/v1/ai/suggestions/:id/decision", () => {
    it("should bidirectionally LINK incidents and set duplicateOf when decision is 'link' or 'accepted'", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const incA = await incidentDao.create({
        title: "Incident A",
        description: "Original incident",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const incB = await incidentDao.create({
        title: "Incident B",
        description: "Duplicate incident",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId: incB._id.toString(),
        organizationId: org._id.toString(),
        type: AI_SUGGESTION_TYPE.DUPLICATE,
        inputHash: "duphash1",
        output: {
          bestMatchIncidentId: incA._id.toString(),
          candidateIncidentIds: [incA._id.toString()],
          bestMatchScore: 0.95,
          reason: "Identical symptoms on checkout",
        },
        model: "fake",
        provider: "fake",
      });

      // Submit decision "link"
      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "link" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.ACCEPTED);

      // Verify bidirectional link in database
      const [updatedA, updatedB] = await Promise.all([
        Incident.findById(incA._id).lean().exec(),
        Incident.findById(incB._id).lean().exec(),
      ]);

      expect(updatedB!.duplicateOf?.toString()).toBe(incA._id.toString());
      expect(updatedB!.linkedIncidentIds?.map((id) => id.toString())).toContain(incA._id.toString());
      expect(updatedA!.linkedIncidentIds?.map((id) => id.toString())).toContain(incB._id.toString());
    });

    it("should mark suggestion as dismissed without linking when decision is 'dismissed'", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const incA = await incidentDao.create({
        title: "Incident A",
        description: "Original incident",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const incB = await incidentDao.create({
        title: "Incident B",
        description: "Unrelated incident",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      const suggestion = await aiSuggestionDao.create({
        incidentId: incB._id.toString(),
        organizationId: org._id.toString(),
        type: AI_SUGGESTION_TYPE.DUPLICATE,
        inputHash: "duphash2",
        output: {
          bestMatchIncidentId: incA._id.toString(),
          candidateIncidentIds: [incA._id.toString()],
          bestMatchScore: 0.72,
          reason: "Possible false link",
        },
        model: "fake",
        provider: "fake",
      });

      const res = await request(app)
        .post(`/api/v1/ai/suggestions/${suggestion._id}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "dismissed" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.userDecision).toBe(AI_USER_DECISION.DISMISSED);

      const updatedB = await Incident.findById(incB._id).lean().exec();
      expect(updatedB!.duplicateOf).toBeFalsy();
      expect(updatedB!.linkedIncidentIds).toEqual([]);
    });
  });

  describe("3. Audit Metrics & False-Link Rate Tracking", () => {
    it("should compute accurate false-link rate in audit telemetry", async () => {
      const { org, user } = await setupOrgWithUser();

      const inc = await incidentDao.create({
        title: "Incident Test",
        description: "Testing telemetry",
        priority: INCIDENT_PRIORITY.LOW,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      // 1 accepted link
      await aiSuggestionDao.create({
        incidentId: inc._id.toString(),
        organizationId: org._id.toString(),
        type: AI_SUGGESTION_TYPE.DUPLICATE,
        inputHash: "h1",
        output: {},
        model: "fake",
        provider: "fake",
        userDecision: AI_USER_DECISION.ACCEPTED,
      });

      // 3 dismissed (false positives)
      for (let i = 0; i < 3; i++) {
        await aiSuggestionDao.create({
          incidentId: inc._id.toString(),
          organizationId: org._id.toString(),
          type: AI_SUGGESTION_TYPE.DUPLICATE,
          inputHash: `h_dismiss_${i}`,
          output: {},
          model: "fake",
          provider: "fake",
          userDecision: AI_USER_DECISION.DISMISSED,
        });
      }

      const metrics = await aiSuggestionDao.getAuditMetrics(org._id);

      expect(metrics.duplicateMetrics).toBeDefined();
      expect(metrics.duplicateMetrics!.total).toBe(4);
      expect(metrics.duplicateMetrics!.linked).toBe(1);
      expect(metrics.duplicateMetrics!.dismissed).toBe(3);
      // 3 dismissed out of 4 decided = 75.0% false link rate
      expect(metrics.duplicateMetrics!.falseLinkRate).toBe(75.0);
    });
  });
});

