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
import { alertDao } from "../src/dao/alertDao";
import { aiSuggestionDao } from "../src/dao/aiSuggestionDao";
import { alertService } from "../src/services/alertService";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { Incident } from "../src/models/Incident";
import { Alert } from "../src/models/Alert";
import { FakeEmbeddingProvider } from "../src/services/ai/embeddings/fakeEmbeddingProvider";
import * as embeddingFactory from "../src/services/ai/embeddings";
import {
  ROLES,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  ALERT_STATUS,
  AI_SUGGESTION_TYPE,
  AI_USER_DECISION,
} from "../src/types";

describe("Checkpoint A: Alert Grouping (FR-08)", () => {
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
    (config as any).AI_ALERT_GROUPING_ENABLED = true;
    (config as any).AI_ALERT_GROUPING_WINDOW_MINUTES = 30;
    (config as any).AI_ALERT_GROUPING_SIMILARITY_THRESHOLD = 0.82;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupTestEnv = async (tier: 1 | 2 | 3 = 2) => {
    const org = await organizationDao.create({ name: "Acme Corp", slug: `acme-${Date.now()}` });
    const user = await userDao.create({
      name: "SRE Engineer",
      email: `sre-${Date.now()}@acme.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role: ROLES.ADMIN,
      organizationId: org._id,
      isActive: true,
    });

    const service = await serviceDao.create({
      name: "Payment Gateway",
      tier,
      owningTeam: "Payments Platform",
      organizationId: org._id,
      runbookLinks: ["https://wiki.acme.internal/runbooks/payments"],
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: org._id.toString(),
      role: user.role,
    });

    return { org, user, service, token };
  };

  describe("1. Rule 1: Exact Match / Deduplication by Fingerprint (Plain Code, No AI)", () => {
    it("should automatically group incoming alerts with exact same fingerprint into the existing open incident", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      // Ingest 1st alert -> creates an incident
      const res1 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Payment Gateway 504 Gateway Timeout",
          description: "Elevated 504 status codes exceeding 5% threshold",
          severity: "HIGH",
          serviceId: service._id.toString(),
          fingerprint: "payment-gateway-timeout-504",
        });

      expect(res1.status).toBe(201);
      expect(res1.body.data.grouped).toBe(true);
      expect(res1.body.data.createdNewIncident).toBe(true);
      const incidentId = res1.body.data.incidentId;
      expect(incidentId).toBeDefined();

      // Ingest 2nd alert with exact same fingerprint within time window
      const res2 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Payment Gateway 504 Gateway Timeout",
          description: "Second spike in 504 timeouts",
          severity: "HIGH",
          serviceId: service._id.toString(),
          fingerprint: "payment-gateway-timeout-504",
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.grouped).toBe(true);
      expect(res2.body.data.incidentId).toBe(incidentId);

      // Verify incident alertCount incremented
      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incidentId);
      expect(updatedIncident?.alertCount).toBe(2);

      // Check incident alerts endpoint
      const listRes = await request(app)
        .get(`/api/v1/incidents/${incidentId}/alerts`)
        .set("Authorization", `Bearer ${token}`);

      expect(listRes.status).toBe(200);
      expect(listRes.body.data.alertCount).toBe(2);
      expect(listRes.body.data.groupedAlerts.length).toBe(2);
    });

    it("should automatically group by computed fingerprint when fingerprint is omitted (same service + title)", async () => {
      const { org, service, token } = await setupTestEnv(2);

      // Ingest alert 1 without explicit fingerprint
      const res1 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Database connection pool exhausted",
          description: "DB pool active connections at 100%",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res1.status).toBe(201);
      const incidentId = res1.body.data.incidentId;

      // Ingest alert 2 with same service and title
      const res2 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Database connection pool exhausted",
          description: "Another connection pool alert",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.grouped).toBe(true);
      expect(res2.body.data.incidentId).toBe(incidentId);

      const updatedIncident = await incidentDao.findByOrgAndId(org._id, incidentId);
      expect(updatedIncident?.alertCount).toBe(2);
    });
  });

  describe("2. Time Window Limits", () => {
    it("should create a new incident if matching alert arrives outside the grouping window", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      // Create an older incident created 45 minutes ago (> 30 min window)
      const oldTime = new Date(Date.now() - 45 * 60 * 1000);
      const oldIncident = await incidentDao.create({
        title: "Database connection pool exhausted",
        description: "Pool was exhausted earlier",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Update timestamps using raw collection so Mongoose middleware does not overwrite updatedAt with now
      await Incident.collection.updateOne(
        { _id: oldIncident._id },
        { $set: { createdAt: oldTime, updatedAt: oldTime } }
      );

      // Create an alert attached to that old incident
      const oldFingerprint = alertService.computeFingerprint(
        service._id.toString(),
        "Database connection pool exhausted"
      );
      const oldAlert = await alertDao.create({
        organizationId: org._id,
        serviceId: service._id,
        title: "Database connection pool exhausted",
        description: "Old alert",
        severity: INCIDENT_PRIORITY.HIGH,
        fingerprint: oldFingerprint,
        incidentId: oldIncident._id,
        status: ALERT_STATUS.GROUPED,
      });
      await Alert.collection.updateOne(
        { _id: oldAlert._id },
        { $set: { createdAt: oldTime, updatedAt: oldTime } }
      );

      // Ingest new alert with same title now
      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Database connection pool exhausted",
          description: "New fresh occurrence after window expired",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.createdNewIncident).toBe(true);
      expect(res.body.data.incidentId).not.toBe(oldIncident._id.toString());
    });
  });

  describe("3. Tier-1 P1 Safeguard", () => {
    it("should never silently auto-group a Tier-1 CRITICAL alert; flags for human review instead", async () => {
      // Tier 1 service
      const { org, service, token } = await setupTestEnv(1);

      // Ingest initial CRITICAL alert -> creates incident
      const res1 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Core Auth Latency Spike P1",
          description: "P99 Auth latency > 2000ms",
          severity: "CRITICAL",
          serviceId: service._id.toString(),
          fingerprint: "auth-tier1-p1",
        });

      expect(res1.status).toBe(201);
      const incidentId = res1.body.data.incidentId;

      // Ingest second CRITICAL alert with same fingerprint
      const res2 = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Core Auth Latency Spike P1",
          description: "Second critical alarm on tier-1 service",
          severity: "CRITICAL",
          serviceId: service._id.toString(),
          fingerprint: "auth-tier1-p1",
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.grouped).toBe(false);
      expect(res2.body.data.reviewRequired).toBe(true);
      expect(res2.body.data.suggestedIncidentId).toBe(incidentId);

      // Verify incident alertCount did NOT increment silently
      const incident = await incidentDao.findByOrgAndId(org._id, incidentId);
      expect(incident?.alertCount).toBe(1);

      // Verify ai_suggestion was created for human review
      const alertsRes = await request(app)
        .get(`/api/v1/incidents/${incidentId}/alerts`)
        .set("Authorization", `Bearer ${token}`);

      expect(alertsRes.status).toBe(200);
      expect(alertsRes.body.data.suggestedAlerts.length).toBe(1);
      expect(alertsRes.body.data.suggestedAlerts[0].isTier1Safeguard).toBe(true);
    });
  });

  describe("4. Rule 2: Embedding Similarity Grouping & Human-in-the-Loop", () => {
    it("should suggest grouping when semantic similarity is above threshold and require human click", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      // Existing open incident
      const incident = await incidentDao.create({
        title: "High API Error Rate in Checkout Service",
        description: "Checkout service failing with internal server error 500",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Incoming alert with different wording but sharing semantic keywords ("checkout service error rate failing")
      // With FakeEmbeddingProvider, token overlap produces high cosine similarity
      (config as any).AI_ALERT_GROUPING_SIMILARITY_THRESHOLD = 0.50; // configure threshold for test

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Checkout Service Error Rate Spike",
          description: "Checkout service error rate is elevated and failing requests",
          severity: "HIGH",
          serviceId: service._id.toString(),
          fingerprint: "diff-fp-checkout-errors",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.grouped).toBe(false);
      expect(res.body.data.aiSuggested).toBe(true);
      expect(res.body.data.suggestedIncidentId).toBe(incident._id.toString());

      // Verify human-in-the-loop: Not auto-merged
      const incCheck = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(incCheck?.alertCount).toBe(1);

      // Check incident alerts endpoint shows suggested alert
      const listRes = await request(app)
        .get(`/api/v1/incidents/${incident._id}/alerts`)
        .set("Authorization", `Bearer ${token}`);

      expect(listRes.body.data.suggestedAlerts.length).toBe(1);
      const suggested = listRes.body.data.suggestedAlerts[0];
      expect(suggested.alert.title).toBe("Checkout Service Error Rate Spike");
      expect(suggested.suggestionId).toBeDefined();

      // Human accepts suggestion
      const acceptRes = await request(app)
        .post(`/api/v1/incidents/${incident._id}/alerts/${suggested.alert._id}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "accept" });

      expect(acceptRes.status).toBe(200);

      // Alert is now grouped
      const incAfterAccept = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(incAfterAccept?.alertCount).toBe(2);

      const listAfterAccept = await request(app)
        .get(`/api/v1/incidents/${incident._id}/alerts`)
        .set("Authorization", `Bearer ${token}`);

      expect(listAfterAccept.body.data.groupedAlerts.length).toBe(1);
      expect(listAfterAccept.body.data.suggestedAlerts.length).toBe(0);
    });

    it("should create a separate incident when a suggested alert group is dismissed", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      const incident = await incidentDao.create({
        title: "Checkout Error Rate High",
        description: "Checkout failing requests",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      (config as any).AI_ALERT_GROUPING_SIMILARITY_THRESHOLD = 0.50;

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Payment Checkout Failures Elevated",
          description: "Payment checkout failing requests with high errors",
          severity: "HIGH",
          serviceId: service._id.toString(),
          fingerprint: "diff-fp-dismiss-test",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.aiSuggested).toBe(true);

      const alertId = res.body.data.alert._id;

      // Human dismisses the suggestion
      const dismissRes = await request(app)
        .post(`/api/v1/incidents/${incident._id}/alerts/${alertId}/decision`)
        .set("Authorization", `Bearer ${token}`)
        .send({ decision: "dismiss" });

      expect(dismissRes.status).toBe(200);
      expect(dismissRes.body.data.separateIncidentId).toBeDefined();

      // Confirm a separate incident was created and original incident remained untouched
      const separateIncident = await incidentDao.findByOrgAndId(
        org._id,
        dismissRes.body.data.separateIncidentId
      );
      expect(separateIncident).toBeDefined();
      expect(separateIncident?.title).toBe("Payment Checkout Failures Elevated");

      const origIncident = await incidentDao.findByOrgAndId(org._id, incident._id);
      expect(origIncident?.alertCount).toBe(1);
    });
  });

  describe("5. Fail-Open Architecture (Embeddings Down / Redis Down)", () => {
    it("should safely fail open and create a new incident if embedding provider throws", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      // Create an existing incident
      await incidentDao.create({
        title: "Service Latency Elevated",
        description: "Service latency is high",
        priority: INCIDENT_PRIORITY.MEDIUM,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Force embedding provider to fail
      fakeEmbeddingProvider.setShouldFail(true);

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Service Latency Elevated New",
          description: "Service latency is high again",
          severity: "MEDIUM",
          serviceId: service._id.toString(),
          fingerprint: "different-fingerprint-fail-open",
        });

      // Ingestion must NOT 500 error: fail-open creates a new incident
      expect(res.status).toBe(201);
      expect(res.body.data.grouped).toBe(true);
      expect(res.body.data.createdNewIncident).toBe(true);
    });

    it("should safely ingest alerts and fail-open when Redis is completely unreachable", async () => {
      const { service, token } = await setupTestEnv(2);

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Redis Offline Ingestion Test",
          description: "Alert created while broker is down",
          severity: "MEDIUM",
          serviceId: service._id.toString(),
          fingerprint: "redis-down-test-fp",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.grouped).toBe(true);
      expect(res.body.data.createdNewIncident).toBe(true);
    });
  });

  describe("6. Webhook Authentication & Security Guardrails (FR-08)", () => {
    it("should reject unauthenticated alert ingestion with 401 Unauthorized", async () => {
      const { service } = await setupTestEnv(2);

      const res = await request(app)
        .post("/api/v1/alerts")
        .send({
          title: "Unauthenticated Ingest",
          description: "Should fail auth",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toMatch(/^(AUTHENTICATION_ERROR|UNAUTHORIZED)$/);
    });

    it("should reject alert ingestion with invalid shared secret with 401", async () => {
      const { service } = await setupTestEnv(2);

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("X-Resolver-Secret", "wrong-secret-value-1234")
        .send({
          title: "Bad Secret Ingest",
          description: "Should fail with 401",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should reject alert ingestion with invalid HMAC signature with 401", async () => {
      const { service } = await setupTestEnv(2);

      const res = await request(app)
        .post("/api/v1/alerts")
        .set("X-Resolver-Signature", "deadbeef0123456789abcdef0123456789abcdef0123456789abcdef0123456789")
        .send({
          title: "Bad HMAC Ingest",
          description: "Should fail with 401",
          severity: "HIGH",
          serviceId: service._id.toString(),
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should successfully ingest alert via X-Resolver-Secret shared secret", async () => {
      const { service } = await setupTestEnv(2);

      const res = await request(app)
        .post("/api/v1/alerts/ingest")
        .set("X-Resolver-Secret", config.ALERT_INGEST_SECRET)
        .send({
          title: "Valid Secret Ingest",
          description: "Successfully authenticated via X-Resolver-Secret",
          severity: "MEDIUM",
          serviceId: service._id.toString(),
          fingerprint: "secret-auth-fp-1",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alert).toBeDefined();
    });

    it("should successfully ingest alert via valid HMAC-SHA256 signature", async () => {
      const { service } = await setupTestEnv(2);

      const payload = {
        title: "Valid HMAC Ingest",
        description: "Authenticated with HMAC signature",
        severity: "MEDIUM",
        serviceId: service._id.toString(),
        fingerprint: "hmac-auth-fp-1",
      };

      const crypto = await import("crypto");
      const signature = crypto
        .createHmac("sha256", config.ALERT_INGEST_SECRET)
        .update(JSON.stringify(payload))
        .digest("hex");

      const res = await request(app)
        .post("/api/v1/alerts/ingest")
        .set("X-Resolver-Signature", signature)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.alert).toBeDefined();
    });
  });

  describe("7. Similarity Threshold Boundary Tests", () => {
    it("should NOT suggest grouping when embedding similarity is strictly below threshold", async () => {
      const { org, user, service, token } = await setupTestEnv(2);

      // Existing open incident
      await incidentDao.create({
        title: "Database Memory Exhaustion",
        description: "Postgres primary buffer pool 95% full",
        priority: INCIDENT_PRIORITY.HIGH,
        serviceId: service._id,
        organizationId: org._id,
        createdBy: user._id,
        status: INCIDENT_STATUS.OPEN,
      });

      // Natural semantic disparity ensures similarity is strictly below threshold of 0.82
      const res = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Completely Unrelated Network Error",
          description: "DNS resolution timeout on external CDN",
          severity: "HIGH",
          serviceId: service._id.toString(),
          fingerprint: "sub-threshold-fp",
        });

      expect(res.status).toBe(201);
      // Below threshold -> creates separate incident instead of suggesting
      expect(res.body.data.createdNewIncident).toBe(true);
      expect(res.body.data.aiSuggested).toBeFalsy();
    });
  });

  describe("8. Alert Flood Protection & Unbounded Incident Prevention", () => {
    it("should enforce flood cap per window and attach excess alerts to existing open incident", async () => {
      const { service, token } = await setupTestEnv(2);
      const alertServiceModule = await import("../src/services/alertService");
      alertServiceModule.resetAlertFloodTracker();

      (config as any).ALERT_FLOOD_INCIDENT_CAP = 3;

      // Ingest 3 distinct alerts -> creates 3 incidents (reaches cap of 3)
      for (let i = 1; i <= 3; i++) {
        const res = await request(app)
          .post("/api/v1/alerts")
          .set("Authorization", `Bearer ${token}`)
          .send({
            title: `Flood Alert ${i}`,
            description: `Burst incident creation ${i}`,
            severity: "MEDIUM",
            serviceId: service._id.toString(),
            fingerprint: `burst-fp-${i}`,
          });

        expect(res.status).toBe(201);
        expect(res.body.data.createdNewIncident).toBe(true);
      }

      // 4th alert exceeds cap -> must NOT create a 4th incident!
      const excessRes = await request(app)
        .post("/api/v1/alerts")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Excess Alert Exceeding Cap",
          description: "4th alert in burst window",
          severity: "MEDIUM",
          serviceId: service._id.toString(),
          fingerprint: "burst-fp-excess-4",
        });

      expect(excessRes.status).toBe(201);
      expect(excessRes.body.data.createdNewIncident).toBe(false);
      expect(excessRes.body.data.floodCapped).toBe(true);
      expect(excessRes.body.data.grouped).toBe(true);

      // Clean up tracker
      alertServiceModule.resetAlertFloodTracker();
      (config as any).ALERT_FLOOD_INCIDENT_CAP = 10;
    });
  });
});
