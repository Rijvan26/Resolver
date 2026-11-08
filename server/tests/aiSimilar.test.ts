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
import { aiService } from "../src/services/ai/aiService";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { PROMPTS } from "../src/services/ai/prompts";
import { FakeEmbeddingProvider } from "../src/services/ai/embeddings/fakeEmbeddingProvider";
import * as embeddingFactory from "../src/services/ai/embeddings";
import {
  ROLES,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
} from "../src/types";

describe("AI Step 2: Similar Incidents (FR-07)", () => {
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
    (config as any).AI_SIMILAR_THRESHOLD = 0.60;
    (config as any).AI_SIMILAR_SERVICE_BOOST = 0.05;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupOrgWithUser = async (orgName = "Acme Corp", slug = "acme-corp") => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: "SRE Lead",
      email: `sre-${Date.now()}@${slug}.com`,
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

  describe("1. aiService.findSimilarIncidents Pure Vector Logic", () => {
    it("should return available: true with empty array when no past resolved incidents exist", async () => {
      const { org, user } = await setupOrgWithUser();

      const incident = await incidentDao.create({
        title: "Active outage in payments",
        description: "Payments API is timing out under load",
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
      });

      const result = await aiService.findSimilarIncidents(incident._id, org._id);

      expect(result.available).toBe(true);
      expect(result.similarIncidents).toEqual([]);
    });

    it("should exclude the target incident itself from similar results", async () => {
      const { org, user } = await setupOrgWithUser();

      // Create target incident as resolved
      const incident = await incidentDao.create({
        title: "Active outage in payments",
        description: "Payments API is timing out under load",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.RESOLVED,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Embed target incident
      const fakeProvider = new FakeEmbeddingProvider();
      const res = await fakeProvider.embed([`${incident.title} ${incident.description}`]);
      await incidentEmbeddingDao.upsert({
        incidentId: incident._id,
        organizationId: org._id,
        vector: res.vectors[0],
        model: res.model,
        provider: res.provider,
        dim: res.dim,
        textHash: "targethash",
      });

      const result = await aiService.findSimilarIncidents(incident._id, org._id);

      expect(result.available).toBe(true);
      expect(result.similarIncidents).toEqual([]);
      expect(result.similarIncidents.some((s) => s.incidentId === incident._id.toString())).toBe(false);
    });

    it("should strictly only match PAST resolved or closed incidents (ignore OPEN and IN_PROGRESS)", async () => {
      const { org, user } = await setupOrgWithUser();

      const target = await incidentDao.create({
        title: "Kafka buffer overflow",
        description: "Events backing up in ingestion pipeline",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Open incident with identical text
      const openIncident = await incidentDao.create({
        title: "Kafka buffer overflow",
        description: "Events backing up in ingestion pipeline",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.IN_PROGRESS,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Resolved incident with identical text
      const resolvedIncident = await incidentDao.create({
        title: "Kafka buffer overflow",
        description: "Events backing up in ingestion pipeline",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.RESOLVED,
        organizationId: org._id,
        createdBy: user._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const [embTarget, embOpen, embResolved] = await Promise.all([
        fakeProvider.embed([target.title]),
        fakeProvider.embed([openIncident.title]),
        fakeProvider.embed([resolvedIncident.title]),
      ]);

      await incidentEmbeddingDao.upsert({
        incidentId: target._id,
        organizationId: org._id,
        vector: embTarget.vectors[0],
        model: embTarget.model,
        provider: embTarget.provider,
        dim: embTarget.dim,
        textHash: "thash",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: openIncident._id,
        organizationId: org._id,
        vector: embOpen.vectors[0],
        model: embOpen.model,
        provider: embOpen.provider,
        dim: embOpen.dim,
        textHash: "ohash",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: resolvedIncident._id,
        organizationId: org._id,
        vector: embResolved.vectors[0],
        model: embResolved.model,
        provider: embResolved.provider,
        dim: embResolved.dim,
        textHash: "rhash",
      });

      const result = await aiService.findSimilarIncidents(target._id, org._id);

      expect(result.available).toBe(true);
      expect(result.similarIncidents.length).toBe(1);
      expect(result.similarIncidents[0].incidentId).toBe(resolvedIncident._id.toString());
    });

    it("should apply configurable same-service boost to matching services", async () => {
      const { org, user } = await setupOrgWithUser();

      const serviceA = await serviceDao.create({
        name: "billing-api",
        tier: 1,
        owningTeam: "Billing Team",
        organizationId: org._id,
      });

      const serviceB = await serviceDao.create({
        name: "auth-api",
        tier: 1,
        owningTeam: "Auth Team",
        organizationId: org._id,
      });

      const target = await incidentDao.create({
        title: "Payment gateway timeout",
        description: "Card charging fails",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        serviceId: serviceA._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const candidateSameService = await incidentDao.create({
        title: "Billing database lock contention",
        description: "Queries stuck on transaction",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.RESOLVED,
        serviceId: serviceA._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Construct identical vector for controlled test
      const baseVector = new Array(768).fill(0.1);
      baseVector[0] = 1.0;

      await Promise.all([
        incidentEmbeddingDao.upsert({
          incidentId: target._id,
          organizationId: org._id,
          vector: baseVector,
          model: "fake",
          provider: "fake",
          dim: 768,
          textHash: "t1",
        }),
        incidentEmbeddingDao.upsert({
          incidentId: candidateSameService._id,
          organizationId: org._id,
          vector: baseVector, // Cosine similarity = 1.0
          model: "fake",
          provider: "fake",
          dim: 768,
          textHash: "c1",
        }),
      ]);

      const result = await aiService.findSimilarIncidents(target._id, org._id, {
        boostSameService: 0.05,
      });

      expect(result.available).toBe(true);
      expect(result.similarIncidents.length).toBe(1);
      expect(result.similarIncidents[0].service).toBe("billing-api");
      // Score capped at 1.0
      expect(result.similarIncidents[0].similarityScore).toBe(1.0);
    });

    it("should enforce multi-tenant isolation and never return incidents from other organizations", async () => {
      const { org: org1, user: user1 } = await setupOrgWithUser("Org One", "org-one");
      const { org: org2, user: user2 } = await setupOrgWithUser("Org Two", "org-two");

      const targetOrg1 = await incidentDao.create({
        title: "Elasticsearch high memory watermark",
        description: "Cluster read only",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org1._id,
        createdBy: user1._id,
      });

      const pastOrg2 = await incidentDao.create({
        title: "Elasticsearch high memory watermark",
        description: "Cluster read only",
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.RESOLVED,
        organizationId: org2._id,
        createdBy: user2._id,
      });

      const fakeProvider = new FakeEmbeddingProvider();
      const res = await fakeProvider.embed(["Elasticsearch high memory watermark"]);

      await incidentEmbeddingDao.upsert({
        incidentId: targetOrg1._id,
        organizationId: org1._id,
        vector: res.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: pastOrg2._id,
        organizationId: org2._id,
        vector: res.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const result = await aiService.findSimilarIncidents(targetOrg1._id, org1._id);

      expect(result.available).toBe(true);
      expect(result.similarIncidents).toEqual([]);
    });

    it("should fail open and return available: false if embedding provider throws", async () => {
      const { org, user } = await setupOrgWithUser();

      const incident = await incidentDao.create({
        title: "Redis replica sync failed",
        description: "Replication lag exceeded 500mb",
        priority: INCIDENT_PRIORITY.MEDIUM,
        status: INCIDENT_STATUS.OPEN,
        organizationId: org._id,
        createdBy: user._id,
      });

      // No embedding exists, and we simulate provider down
      vi.spyOn(embeddingFactory, "getEmbeddingProvider").mockImplementation(() => {
        const failingProvider = new FakeEmbeddingProvider();
        failingProvider.setShouldFail(true);
        return failingProvider;
      });

      const result = await aiService.findSimilarIncidents(incident._id, org._id);

      expect(result.available).toBe(false);
      expect(result.similarIncidents).toEqual([]);
      expect(result.reason).toContain("unavailable");
    });
  });

  describe("2. REST API: GET /api/v1/incidents/:id/ai/similar", () => {
    it("should reject unauthenticated requests with 401 Unauthorized", async () => {
      const fakeId = new Types.ObjectId().toString();
      const res = await request(app).get(`/api/v1/incidents/${fakeId}/ai/similar`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return 404 if incident does not exist", async () => {
      const { token } = await setupOrgWithUser();
      const nonExistentId = new Types.ObjectId().toString();

      const res = await request(app)
        .get(`/api/v1/incidents/${nonExistentId}/ai/similar`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it("should return 200 with similar incidents structure", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const service = await serviceDao.create({
        name: "checkout-svc",
        tier: 1,
        owningTeam: "Checkout Team",
        organizationId: org._id,
      });

      const target = await incidentDao.create({
        title: "Checkout 500 Internal Server Errors",
        description: "Payment gateway throwing 500s",
        priority: INCIDENT_PRIORITY.CRITICAL,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      const past = await incidentDao.create({
        title: "Checkout 500 Internal Server Errors",
        description: "Payment gateway throwing 500s",
        priority: INCIDENT_PRIORITY.CRITICAL,
        finalSeverity: INCIDENT_PRIORITY.CRITICAL,
        status: INCIDENT_STATUS.RESOLVED,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
      });

      // Embed target and past
      const fakeProvider = new FakeEmbeddingProvider();
      const resEmb = await fakeProvider.embed(["Checkout 500 Internal Server Errors"]);

      await incidentEmbeddingDao.upsert({
        incidentId: target._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: past._id,
        organizationId: org._id,
        vector: resEmb.vectors[0],
        model: "fake",
        provider: "fake",
        dim: 768,
        textHash: "h2",
      });

      const res = await request(app)
        .get(`/api/v1/incidents/${target._id}/ai/similar`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.available).toBe(true);
      expect(res.body.data.similarIncidents.length).toBe(1);

      const item = res.body.data.similarIncidents[0];
      expect(item.incidentId).toBe(past._id.toString());
      expect(item.title).toBe("Checkout 500 Internal Server Errors");
      expect(item.service).toBe("checkout-svc");
      expect(item.finalSeverity).toBe(INCIDENT_PRIORITY.CRITICAL);
      expect(item.similarityScore).toBe(1.0);
      expect(item.link).toBe(`/incidents/${past._id.toString()}`);
    });
  });

  describe("3. Triage Prompt Augmentation with Similar Incidents", () => {
    it("should include up to 3 similar past incidents in triage prompt", () => {
      const prompt = PROMPTS.triage.user({
        title: "Search cluster degraded",
        description: "Latency spiked across all shards",
        serviceName: "search-api",
        serviceTier: 1,
        owningTeam: "Search SRE",
        similarIncidents: [
          {
            title: "Search indexing bottleneck",
            service: "search-api",
            finalSeverity: "CRITICAL",
            resolutionNotes: "Scaled indexer replicas from 3 to 9",
          },
        ],
      });

      expect(prompt).toContain("Similar Past Incidents (Historical Context):");
      expect(prompt).toContain("Search indexing bottleneck");
      expect(prompt).toContain("Final Severity: CRITICAL");
      expect(prompt).toContain("Scaled indexer replicas from 3 to 9");
      expect(prompt).toContain("<incident_data>");
      expect(prompt).toContain("</incident_data>");
    });

    it("should work cleanly when no similar incidents are provided", () => {
      const prompt = PROMPTS.triage.user({
        title: "Isolated crash",
        description: "Null pointer in worker",
      });

      expect(prompt).not.toContain("Similar Past Incidents");
      expect(prompt).toContain("Isolated crash");
    });
  });
});

