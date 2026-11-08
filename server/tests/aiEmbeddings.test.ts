import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { Types } from "mongoose";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { config } from "../src/config/config";
import {
  cosineSimilarity,
  normalizeVector,
  findTopSimilar,
} from "../src/services/ai/embeddings/cosineSimilarity";
import {
  buildIncidentEmbeddingText,
  hashEmbeddingText,
} from "../src/services/ai/embeddings/incidentEmbedText";
import { FakeEmbeddingProvider } from "../src/services/ai/embeddings/fakeEmbeddingProvider";
import { GeminiEmbeddingProvider } from "../src/services/ai/embeddings/geminiEmbeddingProvider";
import { getEmbeddingProvider } from "../src/services/ai/embeddings";
import { incidentEmbeddingDao } from "../src/dao/incidentEmbeddingDao";
import { incidentDao } from "../src/dao/incidentDao";
import { serviceDao } from "../src/dao/serviceDao";
import { organizationDao } from "../src/dao/organizationDao";
import { userDao } from "../src/dao/userDao";
import { incidentService } from "../src/services/incidentService";
import { processEmbedJob } from "../src/services/ai/queue/worker";
import { ROLES, INCIDENT_STATUS, INCIDENT_PRIORITY } from "../src/types";

describe("AI Step 1: Embeddings Foundation (SRS-AI-001)", () => {
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
    (config as any).EMBEDDING_PROVIDER = "fake";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupOrgAndUser = async () => {
    const org = await organizationDao.create({
      name: "Acme SRE Org",
      slug: `acme-${Date.now()}`,
    });
    const user = await userDao.create({
      name: "Alice Engineer",
      email: `alice-${Date.now()}@acme.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role: ROLES.ADMIN,
      organizationId: org._id,
      isActive: true,
    });
    return { org, user };
  };

  // ============================================================================
  // 1. Cosine Similarity Utility Tests
  // ============================================================================
  describe("1. Cosine Similarity Utility", () => {
    it("should return 1.0 for identical non-zero vectors", () => {
      const v1 = [1, 2, 3, 4];
      const v2 = [1, 2, 3, 4];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
    });

    it("should return -1.0 for exact opposite vectors", () => {
      const v1 = [1, 2, 3];
      const v2 = [-1, -2, -3];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
    });

    it("should return 0.0 for orthogonal vectors", () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it("should return 0.0 for zero vectors or empty arrays", () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([], [1, 2, 3])).toBe(0);
      expect(cosineSimilarity(null, [1, 2, 3])).toBe(0);
      expect(cosineSimilarity([1, 2, 3], undefined)).toBe(0);
    });

    it("should return 0.0 for mismatched vector dimensions", () => {
      const v1 = [1, 2, 3];
      const v2 = [1, 2, 3, 4];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it("normalizeVector should produce an L2 unit norm vector", () => {
      const v = [3, 4];
      const normalized = normalizeVector(v);
      expect(normalized[0]).toBeCloseTo(0.6, 5);
      expect(normalized[1]).toBeCloseTo(0.8, 5);

      const norm = Math.sqrt(
        normalized.reduce((acc, val) => acc + val * val, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it("findTopSimilar should filter by threshold, sort descending, and respect limit", () => {
      const target = [1, 0, 0];
      const candidates = [
        { id: "cand-high", vector: [0.9, 0.1, 0] },     // Sim ~0.99
        { id: "cand-med", vector: [0.7, 0.7, 0] },      // Sim ~0.70
        { id: "cand-low", vector: [0.1, 0.9, 0] },      // Sim ~0.11
        { id: "cand-zero", vector: [0, 1, 0] },         // Sim = 0
      ];

      const results = findTopSimilar(target, candidates, {
        limit: 2,
        minThreshold: 0.5,
      });

      expect(results.length).toBe(2);
      expect(results[0].id).toBe("cand-high");
      expect(results[0].similarity).toBeGreaterThan(0.9);
      expect(results[1].id).toBe("cand-med");
      expect(results[1].similarity).toBeGreaterThan(0.6);
    });
  });

  // ============================================================================
  // 2. Incident Embedding Text Builder & Redaction
  // ============================================================================
  describe("2. Incident Embedding Text Builder & Redaction", () => {
    it("should build clean text from title, service, and description", () => {
      const prepared = buildIncidentEmbeddingText({
        title: "API Gateway 502 Bad Gateway",
        serviceName: "gateway-api",
        description: "Requests failing during deployment rollout",
      });

      expect(prepared.text).toContain("Title: API Gateway 502 Bad Gateway");
      expect(prepared.text).toContain("Service: gateway-api");
      expect(prepared.text).toContain("Description: Requests failing during deployment rollout");
      expect(prepared.textHash).toBeDefined();
      expect(prepared.textHash.length).toBe(64); // SHA-256 hex string
    });

    it("should append resolution notes when present", () => {
      const prepared = buildIncidentEmbeddingText({
        title: "Search cluster latency",
        serviceName: "search-service",
        description: "Queries timing out",
        resolutionNotes: "Scaled replica shards from 2 to 6",
      });

      expect(prepared.text).toContain("Resolution: Scaled replica shards from 2 to 6");
    });

    it("should redact sensitive tokens, passwords, API keys, and IP addresses before hashing", () => {
      const prepared = buildIncidentEmbeddingText({
        title: "Database connection failed",
        serviceName: "billing-db",
        description: 'Error connecting with password="supersecretpass" and host 192.168.1.100',
      });

      expect(prepared.text).not.toContain("supersecretpass");
      expect(prepared.text).not.toContain("192.168.1.100");
      expect(prepared.text).toContain("[REDACTED_SECRET]");
      expect(prepared.text).toContain("[REDACTED_IP]");
    });

    it("should produce identical textHash for identical input and different for modified input", () => {
      const input = {
        title: "Auth timeout",
        serviceName: "auth-svc",
        description: "JWT verification failed",
      };

      const prep1 = buildIncidentEmbeddingText(input);
      const prep2 = buildIncidentEmbeddingText(input);
      expect(prep1.textHash).toBe(prep2.textHash);

      const prep3 = buildIncidentEmbeddingText({
        ...input,
        description: "JWT verification succeeded after restart",
      });
      expect(prep3.textHash).not.toBe(prep1.textHash);
    });
  });

  // ============================================================================
  // 3. FakeEmbeddingProvider (Zero-Network Test Provider)
  // ============================================================================
  describe("3. FakeEmbeddingProvider", () => {
    it("should generate deterministic vectors with specified dimension", async () => {
      const provider = new FakeEmbeddingProvider({ dim: 768 });
      const result = await provider.embed(["Payment gateway timeout"]);

      expect(result.provider).toBe("fake");
      expect(result.dim).toBe(768);
      expect(result.vectors.length).toBe(1);
      expect(result.vectors[0].length).toBe(768);

      // Verify unit norm
      const norm = Math.sqrt(
        result.vectors[0].reduce((acc, v) => acc + v * v, 0)
      );
      expect(norm).toBeCloseTo(1.0, 5);
    });

    it("should return high similarity for similar texts and low for dissimilar", async () => {
      const provider = new FakeEmbeddingProvider();
      const res = await provider.embed([
        "Payment gateway connection pool exhausted",
        "Payment gateway connection timeout",
        "Kubernetes worker node disk pressure",
      ]);

      const simSimilar = cosineSimilarity(res.vectors[0], res.vectors[1]);
      const simDifferent = cosineSimilarity(res.vectors[0], res.vectors[2]);

      expect(simSimilar).toBeGreaterThan(0.6);
      expect(simDifferent).toBeLessThan(0.4);
    });

    it("should simulate offline failure when setShouldFail is active", async () => {
      const provider = new FakeEmbeddingProvider({ shouldFail: true });
      await expect(provider.embed(["Test text"])).rejects.toThrow("simulated offline failure");
    });
  });

  // ============================================================================
  // 4. GeminiEmbeddingProvider (Mocked HTTP Fetch)
  // ============================================================================
  describe("4. GeminiEmbeddingProvider (Mocked HTTP Fetch)", () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      global.fetch = vi.fn();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("should throw MISSING_API_KEY if no key is configured", async () => {
      const provider = new GeminiEmbeddingProvider({ apiKey: "" });
      await expect(provider.embed(["Text"])).rejects.toThrow("API key is not configured");
    });

    it("should parse vector from embedContent response for single text", async () => {
      const mockVector = new Array(768).fill(0.1);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ embedding: { values: mockVector } }),
      });

      const provider = new GeminiEmbeddingProvider({
        apiKey: "test-gemini-key",
        defaultModel: "gemini-embedding-001",
      });

      const res = await provider.embed(["Incident description"]);
      expect(res.provider).toBe("gemini");
      expect(res.dim).toBe(768);
      expect(res.vectors.length).toBe(1);
      expect(res.vectors[0]).toEqual(mockVector);
    });

    it("should parse vectors from batchEmbedContents response for multiple texts", async () => {
      const mockVector1 = new Array(768).fill(0.1);
      const mockVector2 = new Array(768).fill(0.2);
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          embeddings: [{ values: mockVector1 }, { values: mockVector2 }],
        }),
      });

      const provider = new GeminiEmbeddingProvider({
        apiKey: "test-gemini-key",
      });

      const res = await provider.embed(["Text 1", "Text 2"]);
      expect(res.vectors.length).toBe(2);
      expect(res.vectors[0]).toEqual(mockVector1);
      expect(res.vectors[1]).toEqual(mockVector2);
    });

    it("should retry on 503 Service Unavailable and succeed on subsequent attempt", async () => {
      const mockVector = new Array(768).fill(0.5);
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ embedding: { values: mockVector } }),
        });

      const provider = new GeminiEmbeddingProvider({
        apiKey: "test-gemini-key",
      });

      const res = await provider.embed(["Retryable test text"]);
      expect(res.vectors.length).toBe(1);
      expect(res.vectors[0]).toEqual(mockVector);
      expect((global.fetch as any).mock.calls.length).toBe(2);
    });
  });

  // ============================================================================
  // 5. IncidentEmbeddingDao (CRUD & Scoping)
  // ============================================================================
  describe("5. IncidentEmbeddingDao (CRUD & Scoping)", () => {
    it("should upsert embedding and retrieve by incidentId", async () => {
      const { org } = await setupOrgAndUser();
      const incidentId = new Types.ObjectId();
      const mockVector = [0.1, 0.2, 0.3];

      const upserted = await incidentEmbeddingDao.upsert({
        incidentId,
        organizationId: org._id,
        vector: mockVector,
        model: "fake-model",
        provider: "fake",
        dim: 3,
        textHash: "hash-123",
      });

      expect(upserted).not.toBeNull();
      expect(upserted.incidentId.toString()).toBe(incidentId.toString());
      expect(upserted.dim).toBe(3);

      const found = await incidentEmbeddingDao.findByIncidentId(incidentId);
      expect(found).not.toBeNull();
      expect(found!.vector).toEqual(mockVector);
      expect(found!.textHash).toBe("hash-123");
    });

    it("should update existing embedding on subsequent upsert without duplicates", async () => {
      const { org } = await setupOrgAndUser();
      const incidentId = new Types.ObjectId();

      await incidentEmbeddingDao.upsert({
        incidentId,
        organizationId: org._id,
        vector: [0.1, 0.1],
        model: "fake-v1",
        provider: "fake",
        dim: 2,
        textHash: "hash-v1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId,
        organizationId: org._id,
        vector: [0.9, 0.9],
        model: "fake-v2",
        provider: "fake",
        dim: 2,
        textHash: "hash-v2",
      });

      const count = await incidentEmbeddingDao.countForOrg(org._id);
      expect(count).toBe(1);

      const updated = await incidentEmbeddingDao.findByIncidentId(incidentId);
      expect(updated!.textHash).toBe("hash-v2");
      expect(updated!.vector).toEqual([0.9, 0.9]);
    });

    it("findForOrg should support excludeIncidentId option", async () => {
      const { org } = await setupOrgAndUser();
      const id1 = new Types.ObjectId();
      const id2 = new Types.ObjectId();

      await incidentEmbeddingDao.upsert({
        incidentId: id1,
        organizationId: org._id,
        vector: [1, 0],
        model: "fake",
        provider: "fake",
        dim: 2,
        textHash: "h1",
      });

      await incidentEmbeddingDao.upsert({
        incidentId: id2,
        organizationId: org._id,
        vector: [0, 1],
        model: "fake",
        provider: "fake",
        dim: 2,
        textHash: "h2",
      });

      const all = await incidentEmbeddingDao.findForOrg(org._id);
      expect(all.length).toBe(2);

      const excluded = await incidentEmbeddingDao.findForOrg(org._id, {
        excludeIncidentId: id1,
      });
      expect(excluded.length).toBe(1);
      expect(excluded[0].incidentId.toString()).toBe(id2.toString());
    });
  });

  // ============================================================================
  // 6. Worker (processEmbedJob) & Skip Re-embedding
  // ============================================================================
  describe("6. Worker (processEmbedJob) & Idempotency", () => {
    it("should embed an incident and store vector in database", async () => {
      const { org, user } = await setupOrgAndUser();
      const service = await serviceDao.create({
        name: "checkout-api",
        tier: 1,
        owningTeam: "Payments",
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Checkout 500 error surge",
        description: "Payment transactions failing",
        organizationId: org._id,
        createdBy: user._id,
        serviceId: service._id,
        priority: INCIDENT_PRIORITY.HIGH,
        status: INCIDENT_STATUS.OPEN,
      });

      await processEmbedJob({
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const embedding = await incidentEmbeddingDao.findByIncidentId(incident._id);
      expect(embedding).not.toBeNull();
      expect(embedding!.dim).toBe(768);
      expect(embedding!.vector.length).toBe(768);
      expect(embedding!.textHash).toBeDefined();
    });

    it("should skip re-embedding when textHash is unchanged", async () => {
      const { org, user } = await setupOrgAndUser();
      const incident = await incidentDao.create({
        title: "Static incident title",
        description: "Static description content",
        organizationId: org._id,
        createdBy: user._id,
        priority: INCIDENT_PRIORITY.MEDIUM,
        status: INCIDENT_STATUS.OPEN,
      });

      // First run: generates embedding
      await processEmbedJob({
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const firstDoc = await incidentEmbeddingDao.findByIncidentId(incident._id);
      expect(firstDoc).not.toBeNull();
      const firstUpdatedAt = firstDoc!.updatedAt;

      // Small tick
      await new Promise((r) => setTimeout(r, 50));

      // Second run: should recognize unchanged textHash and skip
      await processEmbedJob({
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      const secondDoc = await incidentEmbeddingDao.findByIncidentId(incident._id);
      expect(secondDoc!.updatedAt.getTime()).toBe(firstUpdatedAt.getTime());
    });
  });

  // ============================================================================
  // 7. Lifecycle Hooks: Deletion Hook Verification
  // ============================================================================
  describe("7. Lifecycle Hooks (Incident Deletion Hook)", () => {
    it("should delete embedding when parent incident is deleted", async () => {
      const { org, user } = await setupOrgAndUser();
      const incident = await incidentDao.create({
        title: "Temporary test incident",
        description: "To be deleted",
        organizationId: org._id,
        createdBy: user._id,
        priority: INCIDENT_PRIORITY.LOW,
        status: INCIDENT_STATUS.OPEN,
      });

      // Embed the incident
      await processEmbedJob({
        incidentId: incident._id.toString(),
        organizationId: org._id.toString(),
      });

      let embedding = await incidentEmbeddingDao.findByIncidentId(incident._id);
      expect(embedding).not.toBeNull();

      // Delete incident through service
      await incidentService.deleteIncident(
        org._id.toString(),
        incident._id.toString(),
        user._id.toString()
      );

      // Verify incident is deleted
      const checkIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(checkIncident).toBeNull();

      // Verify embedding was deleted via deletion hook
      embedding = await incidentEmbeddingDao.findByIncidentId(incident._id);
      expect(embedding).toBeNull();
    });
  });
});

