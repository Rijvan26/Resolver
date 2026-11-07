import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import request from "supertest";
import { config } from "../src/config/config";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { GroqProvider } from "../src/services/ai/providers/groqProvider";
import { GeminiProvider } from "../src/services/ai/providers/geminiProvider";
import {
  triageOutputSchema,
  summaryOutputSchema,
  postmortemOutputSchema,
  PROMPTS,
} from "../src/services/ai/prompts";
import { aiService } from "../src/services/ai/aiService";
import { incidentDao } from "../src/dao/incidentDao";
import { organizationDao } from "../src/dao/organizationDao";
import { userDao } from "../src/dao/userDao";
import { serviceDao } from "../src/dao/serviceDao";
import { activityDao } from "../src/dao/activityDao";
import { commentDao } from "../src/dao/commentDao";
import { generateAccessToken } from "../src/utils/tokenUtils";
import app from "../src/app";
import {
  ROLES,
  Role,
  AI_STATUS,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
  INCIDENT_STATUS,
} from "../src/types";

describe("Live AI Real Model Integration Tests (.env)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  afterEach(async () => {
    // Small jitter buffer between live model calls to respect rate limits
    await new Promise((r) => setTimeout(r, 600));
  });

  const setupOrgWithUser = async (
    orgName = "Real AI SRE Org",
    slug = "real-ai-sre",
    role: Role = ROLES.ADMIN
  ) => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: `${role} Live User`,
      email: `${role.toLowerCase()}-${Date.now()}@${slug}.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
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

  // ============================================================================
  // 1. Environment & API Key Verification
  // ============================================================================
  describe("1. Environment & Real Key Detection", () => {
    it("should detect configured real API keys in .env", () => {
      expect(config.GROQ_API_KEY).toBeDefined();
      expect(config.GROQ_API_KEY?.startsWith("gsk_")).toBe(true);
      expect(config.GEMINI_API_KEY).toBeDefined();
      expect(config.GEMINI_API_KEY?.length).toBeGreaterThan(10);
      expect(config.AI_ENABLED).toBe(true);
    });
  });

  // ============================================================================
  // 2. Real Groq Model Verification
  // ============================================================================
  describe("2. Real Groq Model (qwen/qwen3.8-27b via Groq LPU)", () => {
    const groq = new GroqProvider({
      apiKey: config.GROQ_API_KEY,
      defaultModel: "qwen/qwen3.8-27b",
    });

    it("should generate valid real triage output matching schema", async () => {
      const prompt = PROMPTS.triage.user({
        title: "High API latency on user authentication service",
        description: "Token validation requests taking over 3000ms. Database CPU at 40%.",
        serviceName: "auth-service",
        serviceTier: 2,
        owningTeam: "Security Platform",
      });

      const result = await groq.generateJson({
        system: PROMPTS.triage.system,
        prompt,
        schema: triageOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.provider).toBe("groq");
      expect(result.model).toBe("qwen/qwen3.8-27b");
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.data.suggestedSeverity).toMatch(/^(P[1-4]|SEV[1-4]|CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(result.data.confidence).toBeGreaterThan(0);
      expect(result.data.confidence).toBeLessThanOrEqual(1);
      expect(result.data.reason.length).toBeGreaterThan(5);
    }, 30000);

    it("should generate valid real summary output matching schema", async () => {
      const prompt = PROMPTS.summary.user({
        title: "High API latency on user authentication service",
        description: "Token validation requests taking over 3000ms",
        serviceName: "auth-service",
        status: "INVESTIGATING",
        priority: "HIGH",
        comments: [
          "Alice: Connection pool limits observed on Redis cache",
          "Bob: Scaled Redis cluster replicas from 2 to 4",
        ],
        activities: [
          "Incident declared as HIGH",
          "Responder Alice assigned",
          "Status updated to INVESTIGATING",
        ],
      });

      const result = await groq.generateJson({
        system: PROMPTS.summary.system,
        prompt,
        schema: summaryOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.data.summary.length).toBeGreaterThan(10);
    }, 30000);

    it("should generate valid real postmortem draft matching schema", async () => {
      const prompt = PROMPTS.postmortem.user({
        title: "High API latency on user authentication service",
        description: "Token validation requests taking over 3000ms",
        serviceName: "auth-service",
        serviceTier: 2,
        createdAt: new Date(Date.now() - 7200000).toISOString(),
        resolvedAt: new Date().toISOString(),
        timeline: [
          "12:00 - Spike in auth latency detected by Synthetic monitors",
          "12:15 - Redis memory pressure identified as root cause",
          "12:30 - Shard capacity increased and evictions ceased",
          "12:45 - Recovery confirmed by SRE",
        ],
      });

      const result = await groq.generateJson({
        system: PROMPTS.postmortem.system,
        prompt,
        schema: postmortemOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.data.rootCause.length).toBeGreaterThan(10);
      expect(Array.isArray(result.data.actionItems)).toBe(true);
      expect(Array.isArray(result.data.lessonsLearned)).toBe(true);
    }, 30000);
  });

  // ============================================================================
  // 3. Real Gemini Model Verification
  // ============================================================================
  describe("3. Real Gemini Model (gemini-3.5-flash-lite via Google AI)", () => {
    const gemini = new GeminiProvider({
      apiKey: config.GEMINI_API_KEY,
      defaultModel: "gemini-3.5-flash-lite",
    });

    it("should generate valid real triage output matching schema", async () => {
      const prompt = PROMPTS.triage.user({
        title: "Intermittent connection dropouts to search index",
        description: "Search queries return 503 for 5% of requests",
        serviceName: "search-cluster",
        serviceTier: 2,
        owningTeam: "Discovery Team",
      });

      const result = await gemini.generateJson({
        system: PROMPTS.triage.system,
        prompt,
        schema: triageOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.provider).toBe("gemini");
      expect(result.model).toBe("gemini-3.5-flash-lite");
      expect(result.latencyMs).toBeGreaterThan(0);
      expect(result.data.suggestedSeverity).toMatch(/^(P[1-4]|SEV[1-4]|CRITICAL|HIGH|MEDIUM|LOW)$/);
      expect(result.data.confidence).toBeGreaterThan(0);
      expect(result.data.reason.length).toBeGreaterThan(5);
    }, 30000);

    it("should generate valid real summary output matching schema", async () => {
      const prompt = PROMPTS.summary.user({
        title: "Intermittent connection dropouts to search index",
        description: "Search queries return 503 for 5% of requests",
        serviceName: "search-cluster",
        status: "INVESTIGATING",
        priority: "MEDIUM",
        comments: [
          "Carol: Node 4 memory utilization at 98%",
          "Dave: Restarting elasticsearch process on node 4",
        ],
        activities: ["Incident declared", "Dave joined the channel"],
      });

      const result = await gemini.generateJson({
        system: PROMPTS.summary.system,
        prompt,
        schema: summaryOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.data.summary.length).toBeGreaterThan(10);
    }, 30000);

    it("should generate valid real postmortem draft matching schema", async () => {
      const prompt = PROMPTS.postmortem.user({
        title: "Intermittent connection dropouts to search index",
        description: "Search queries return 503 for 5% of requests",
        serviceName: "search-cluster",
        serviceTier: 2,
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        resolvedAt: new Date().toISOString(),
        timeline: [
          "10:00 - Memory saturation on search node 4",
          "10:20 - Automated restart initiated",
          "10:35 - Re-indexing complete, all health checks green",
        ],
      });

      const result = await gemini.generateJson({
        system: PROMPTS.postmortem.system,
        prompt,
        schema: postmortemOutputSchema,
        timeoutMs: 25000,
      });

      expect(result.data.rootCause.length).toBeGreaterThan(10);
      expect(Array.isArray(result.data.actionItems)).toBe(true);
    }, 30000);
  });

  // ============================================================================
  // 4. End-to-End aiService with Active .env Provider
  // ============================================================================
  describe("4. End-to-End aiService with Configured Model", () => {
    it("should run live triage fallback when rules are inconclusive", async () => {
      const { org, user } = await setupOrgWithUser("Live SRE Org", "live-sre-org");
      const service = await serviceDao.create({
        name: "analytics-pipeline",
        tier: 3,
        owningTeam: "Data Platform",
        organizationId: org._id,
      });

      const incident = await incidentDao.create({
        title: "Delayed ETL batch processing for analytics",
        description: "Kafka consumer lag increasing on analytics topic by 2000 events/sec",
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        priority: "MEDIUM",
        status: INCIDENT_STATUS.OPEN,
      });

      // Execute live triage through aiService
      const suggestion = await aiService.generateTriage(
        incident._id.toString(),
        org._id.toString()
      );

      expect(suggestion).not.toBeNull();
      expect(suggestion!.type).toBe(AI_SUGGESTION_TYPE.TRIAGE);
      expect(suggestion!.status).toBe("ready");
      expect(suggestion!.userDecision).toBe(AI_USER_DECISION.PENDING);
      expect(suggestion!.latencyMs).toBeGreaterThan(0);

      // Verify incident subdocument
      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updatedIncident!.ai?.status).toBe(AI_STATUS.READY);
      expect(updatedIncident!.ai?.severity).toBeDefined();
      expect(updatedIncident!.finalSeverity).toBeNull(); // Hard rule #1
      expect(updatedIncident!.aiAccepted).toBe(false);
    }, 35000);

    it("should generate live status summary and update incident in DB", async () => {
      const { org, user } = await setupOrgWithUser("Live Summary Org", "live-summary-org");
      const incident = await incidentDao.create({
        title: "Slow response times on checkout gateway",
        description: "Payment confirmation taking 4-6 seconds",
        organizationId: org._id,
        createdBy: user._id,
        priority: "HIGH",
        status: INCIDENT_STATUS.IN_PROGRESS,
      });

      await commentDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        authorId: user._id,
        content: "Scaled out web worker pods from 10 to 25 to absorb load",
      });

      const suggestion = await aiService.generateSummary(
        incident._id.toString(),
        org._id.toString(),
        user._id.toString()
      );

      expect(suggestion).not.toBeNull();
      expect(suggestion!.type).toBe(AI_SUGGESTION_TYPE.SUMMARY);
      expect(suggestion!.status).toBe("ready");

      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(updatedIncident!.ai?.summary).toBeDefined();
      expect(typeof updatedIncident!.ai?.summary).toBe("string");
      expect(updatedIncident!.ai?.summary!.length).toBeGreaterThan(15);
      expect(updatedIncident!.ai?.summaryUpdatedAt).toBeDefined();
    }, 35000);

    it("should generate live postmortem draft for RESOLVED incident", async () => {
      const { org, user } = await setupOrgWithUser("Live Postmortem Org", "live-pm-org");
      const incident = await incidentDao.create({
        title: "DNS resolution failure in us-east-1",
        description: "Internal service discovery failed due to DNS TTL misconfiguration",
        organizationId: org._id,
        createdBy: user._id,
        priority: "CRITICAL",
        status: INCIDENT_STATUS.RESOLVED,
        resolvedAt: new Date(),
      });

      await commentDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        authorId: user._id,
        content: "Updated CoreDNS ConfigMap TTL from 3600 to 60 seconds",
      });

      const suggestion = await aiService.generatePostmortem(
        incident._id.toString(),
        org._id.toString(),
        user._id.toString()
      );

      expect(suggestion).not.toBeNull();
      expect(suggestion!.type).toBe(AI_SUGGESTION_TYPE.POSTMORTEM);
      expect(suggestion!.status).toBe("ready");
      expect((suggestion!.output as any).rootCause).toBeDefined();
      expect((suggestion!.output as any).rootCause.length).toBeGreaterThan(10);

      // Verify audit activity logged
      const activities = await activityDao.findActivitiesByIncident(org._id, incident._id, {
        action: "AI_SUGGESTION_GENERATED",
      });
      expect(activities.some((a) => a.metadata?.type === AI_SUGGESTION_TYPE.POSTMORTEM)).toBe(true);
    }, 35000);

    it("should enforce Hard Rule #1 when accepting real AI suggestion", async () => {
      const { org, user } = await setupOrgWithUser("Live Decision Org", "live-dec-org");
      const incident = await incidentDao.create({
        title: "Memory leak in background image worker",
        description: "Workers restarting every 15 minutes",
        organizationId: org._id,
        createdBy: user._id,
        priority: "MEDIUM",
        status: INCIDENT_STATUS.OPEN,
      });

      const suggestion = await aiService.generateTriage(
        incident._id.toString(),
        org._id.toString()
      );
      expect(suggestion).not.toBeNull();

      // Before decision: finalSeverity MUST be null
      let incidentDoc = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(incidentDoc!.finalSeverity).toBeNull();
      expect(incidentDoc!.aiAccepted).toBe(false);

      // Responder accepts AI recommendation
      const updatedSuggestion = await aiService.recordDecision(
        suggestion!._id.toString(),
        org._id.toString(),
        user._id.toString(),
        AI_USER_DECISION.ACCEPTED
      );

      expect(updatedSuggestion.userDecision).toBe(AI_USER_DECISION.ACCEPTED);

      // After decision: finalSeverity is populated with the AI's triage recommendation!
      incidentDoc = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(incidentDoc!.finalSeverity).toBe(incidentDoc!.ai?.severity);
      expect(incidentDoc!.aiAccepted).toBe(true);
    }, 35000);
  });

  // ============================================================================
  // 5. REST API Endpoints with Real Live Model
  // ============================================================================
  describe("5. REST API Endpoints with Real Live Model", () => {
    it("POST /api/v1/incidents/:id/ai/triage should return 200 with live AI analysis", async () => {
      const { org, user, token } = await setupOrgWithUser("REST Live Org", "rest-live-org");
      const incident = await incidentDao.create({
        title: "API rate limiting threshold reached unexpectedly",
        description: "Legitimate users receiving 429 Too Many Requests",
        organizationId: org._id,
        createdBy: user._id,
        priority: "MEDIUM",
        status: INCIDENT_STATUS.OPEN,
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/triage?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.TRIAGE);
      expect(res.body.data.output.suggestedSeverity).toBeDefined();
      expect(res.body.data.output.confidence).toBeGreaterThan(0);
      expect(res.body.data.output.reason.length).toBeGreaterThan(5);
    }, 35000);

    it("POST /api/v1/incidents/:id/ai/summary should return 200 with live summary", async () => {
      const { org, user, token } = await setupOrgWithUser("REST Summary Org", "rest-sum-org");
      const incident = await incidentDao.create({
        title: "API rate limiting threshold reached unexpectedly",
        description: "Legitimate users receiving 429 Too Many Requests",
        organizationId: org._id,
        createdBy: user._id,
        priority: "HIGH",
        status: INCIDENT_STATUS.IN_PROGRESS,
      });

      await commentDao.create({
        incidentId: incident._id,
        organizationId: org._id,
        authorId: user._id,
        content: "Identified bad bot crawler traffic from AS12345 and applied WAF block rule",
      });

      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/ai/summary?sync=true`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe(AI_SUGGESTION_TYPE.SUMMARY);
      expect(res.body.data.output.summary).toBeDefined();
      expect(res.body.data.output.summary.length).toBeGreaterThan(15);
    }, 35000);

    it("POST /api/v1/incidents/:id/ai/postmortem should return 200 with live postmortem draft", async () => {
      const { org, user, token } = await setupOrgWithUser("REST PM Org", "rest-pm-org");
      const incident = await incidentDao.create({
        title: "API rate limiting threshold reached unexpectedly",
        description: "Legitimate users receiving 429 Too Many Requests",
        organizationId: org._id,
        createdBy: user._id,
        priority: "HIGH",
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
    }, 35000);
  });
});
