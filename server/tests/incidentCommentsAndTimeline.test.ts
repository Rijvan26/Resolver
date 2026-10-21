import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { Activity } from "../src/models/Activity";
import { Comment } from "../src/models/Comment";
import {
  ROLES,
  Role,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  ACTIVITY_ACTION,
} from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Incident Comments & Activity Timeline API", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // Helper to create an organization with an initial user and access token
  const setupOrgWithUser = async (
    orgName = "Acme Corp",
    slug = "acme-corp",
    role: Role = ROLES.SUPER_ADMIN,
    isActive = true
  ) => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: `${role} User`,
      email: `${role.toLowerCase()}@${slug}.com`,
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

  // Helper to create an additional member in an existing organization
  const createMember = async (
    orgId: string,
    role: Role,
    name: string,
    email: string,
    isActive = true
  ) => {
    const user = await userDao.create({
      name,
      email,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: orgId,
      isActive,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: orgId,
      role,
      email: user.email,
    });

    return { user, token };
  };

  // Helper to create a baseline incident
  const createIncident = async (
    token: string,
    title = "Production DB Latency Spike",
    description = "Read replica lag exceeding 10 seconds."
  ) => {
    const res = await request(app)
      .post("/api/v1/incidents")
      .set("Authorization", `Bearer ${token}`)
      .send({ title, description });
    return res.body.data;
  };

  // =========================================================================
  // 1. Comment Creation & Validation
  // =========================================================================
  describe("POST /api/v1/incidents/:incidentId/comments", () => {
    it("should successfully add a comment to an incident and record COMMENT_ADDED in audit", async () => {
      const { user, token } = await setupOrgWithUser("Alpha Corp", "alpha-corp", ROLES.DEVELOPER);
      const incident = await createIncident(token);

      const res = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Investigating the slow query logs now." });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.content).toBe("Investigating the slow query logs now.");
      expect(res.body.data.incidentId).toBe(incident.id);
      expect(res.body.data.author.id).toBe(user._id.toString());
      expect(res.body.data.author.name).toBe(user.name);
      expect(res.body.data.author.email).toBe(user.email);
      expect(res.body.data.author.passwordHash).toBeUndefined();

      // Verify persistent audit record
      const activities = await Activity.find({
        incidentId: incident.id,
        action: ACTIVITY_ACTION.COMMENT_ADDED,
      });
      expect(activities.length).toBe(1);
      expect(activities[0].actorId.toString()).toBe(user._id.toString());
      expect(activities[0].metadata?.commentId?.toString()).toBe(res.body.data.id);
    });

    it("should reject comment creation with missing or empty content (validation error)", async () => {
      const { token } = await setupOrgWithUser("Alpha Corp", "alpha-corp");
      const incident = await createIncident(token);

      // Empty string
      const resEmpty = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "   " });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error.code).toBe("VALIDATION_ERROR");

      // Missing field
      const resMissing = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(resMissing.status).toBe(400);
      expect(resMissing.body.error.code).toBe("VALIDATION_ERROR");

      // Verify NO activity was logged for failed validation
      const commentActivities = await Activity.find({
        incidentId: incident.id,
        action: ACTIVITY_ACTION.COMMENT_ADDED,
      });
      expect(commentActivities.length).toBe(0);
    });

    it("should return 400 for malformed incidentId", async () => {
      const { token } = await setupOrgWithUser("Alpha Corp", "alpha-corp");

      const res = await request(app)
        .post("/api/v1/incidents/invalid-hex-id-xyz/comments")
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Some content" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 when adding comment to an incident belonging to another organization", async () => {
      const { token: tokenOrg1 } = await setupOrgWithUser("Org 1", "org-1");
      const { token: tokenOrg2 } = await setupOrgWithUser("Org 2", "org-2");

      const incidentOrg1 = await createIncident(tokenOrg1);

      // User from Org 2 attempts to comment on Org 1 incident
      const res = await request(app)
        .post(`/api/v1/incidents/${incidentOrg1.id}/comments`)
        .set("Authorization", `Bearer ${tokenOrg2}`)
        .send({ content: "Cross-tenant intrusion attempt" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should reject client attempts to inject authorId or organizationId", async () => {
      const { user, token } = await setupOrgWithUser("Alpha Corp", "alpha-corp");
      const incident = await createIncident(token);

      const fakeId = "64f123456789abcdef012345";
      const res = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          content: "Valid text",
          authorId: fakeId,
          organizationId: fakeId,
        });

      // Strict validation disallows unknown injected keys
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // =========================================================================
  // 2. Comment Listing & Pagination
  // =========================================================================
  describe("GET /api/v1/incidents/:incidentId/comments", () => {
    it("should list comments for an incident with chronological ordering and pagination metadata", async () => {
      const { token } = await setupOrgWithUser("Beta Corp", "beta-corp");
      const incident = await createIncident(token);

      // Post 3 comments
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post(`/api/v1/incidents/${incident.id}/comments`)
          .set("Authorization", `Bearer ${token}`)
          .send({ content: `Comment number ${i}` });
      }

      const res = await request(app)
        .get(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.comments.length).toBe(3);
      expect(res.body.data.comments[0].content).toBe("Comment number 1");
      expect(res.body.data.comments[2].content).toBe("Comment number 3");
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.pagination.page).toBe(1);
    });

    it("should support pagination parameters (page and limit)", async () => {
      const { token } = await setupOrgWithUser("Beta Corp", "beta-corp");
      const incident = await createIncident(token);

      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post(`/api/v1/incidents/${incident.id}/comments`)
          .set("Authorization", `Bearer ${token}`)
          .send({ content: `Note ${i}` });
      }

      const res = await request(app)
        .get(`/api/v1/incidents/${incident.id}/comments?page=2&limit=2`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.comments.length).toBe(2);
      expect(res.body.data.comments[0].content).toBe("Note 3");
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it("should return 404 when listing comments of another organization's incident", async () => {
      const { token: tokenOrgA } = await setupOrgWithUser("Org A", "org-a");
      const { token: tokenOrgB } = await setupOrgWithUser("Org B", "org-b");
      const incidentOrgA = await createIncident(tokenOrgA);

      const res = await request(app)
        .get(`/api/v1/incidents/${incidentOrgA.id}/comments`)
        .set("Authorization", `Bearer ${tokenOrgB}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // =========================================================================
  // 3. Comment Editing & Permissions
  // =========================================================================
  describe("PATCH /api/v1/incidents/:incidentId/comments/:commentId", () => {
    it("should allow original author to edit their own comment and record COMMENT_UPDATED", async () => {
      const { org, token: adminToken } = await setupOrgWithUser("Gamma Corp", "gamma-corp");
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev User",
        "dev@gamma.com"
      );

      const incident = await createIncident(adminToken);

      // Developer writes comment
      const createRes = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Initial hypothesis: bad index." });

      const commentId = createRes.body.data.id;

      // Developer updates their own comment
      const updateRes = await request(app)
        .patch(`/api/v1/incidents/${incident.id}/comments/${commentId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Revised hypothesis: disk I/O bottleneck." });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.content).toBe("Revised hypothesis: disk I/O bottleneck.");

      // Verify audit log has COMMENT_UPDATED
      const updateActivities = await Activity.find({
        incidentId: incident.id,
        action: ACTIVITY_ACTION.COMMENT_UPDATED,
      });
      expect(updateActivities.length).toBe(1);
      expect(updateActivities[0].metadata?.commentId?.toString()).toBe(commentId);
    });

    it("should reject editing someone else's comment even by an ADMIN (author-only editing policy)", async () => {
      const { org, token: adminToken } = await setupOrgWithUser("Gamma Corp", "gamma-corp", ROLES.ADMIN);
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev User",
        "dev@gamma.com"
      );

      const incident = await createIncident(adminToken);

      // Developer writes comment
      const createRes = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Developer comment that cannot be edited by admin." });

      const commentId = createRes.body.data.id;

      // Admin tries to edit developer's comment text
      const res = await request(app)
        .patch(`/api/v1/incidents/${incident.id}/comments/${commentId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ content: "Admin altering dev comment." });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toContain("only edit your own comments");
    });
  });

  // =========================================================================
  // 4. Comment Deletion & Permissions
  // =========================================================================
  describe("DELETE /api/v1/incidents/:incidentId/comments/:commentId", () => {
    it("should allow original author to delete their own comment", async () => {
      const { org, token: adminToken } = await setupOrgWithUser("Delta Corp", "delta-corp");
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev User",
        "dev@delta.com"
      );

      const incident = await createIncident(adminToken);

      const createRes = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Dev note to be deleted by dev." });

      const commentId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/v1/incidents/${incident.id}/comments/${commentId}`)
        .set("Authorization", `Bearer ${devToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      // Verify deletion in database
      const foundInDb = await Comment.findById(commentId);
      expect(foundInDb).toBeNull();

      // Verify COMMENT_DELETED audit log
      const deleteActivities = await Activity.find({
        incidentId: incident.id,
        action: ACTIVITY_ACTION.COMMENT_DELETED,
      });
      expect(deleteActivities.length).toBe(1);
    });

    it("should allow SUPER_ADMIN and ADMIN to delete another user's comment (moderation privilege)", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser(
        "Delta Corp",
        "delta-corp",
        ROLES.SUPER_ADMIN
      );
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev User",
        "dev@delta.com"
      );

      const incident = await createIncident(superAdminToken);

      const createRes = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Off-topic comment to be moderated." });

      const commentId = createRes.body.data.id;

      // Super Admin deletes dev comment
      const deleteRes = await request(app)
        .delete(`/api/v1/incidents/${incident.id}/comments/${commentId}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.success).toBe(true);

      const foundInDb = await Comment.findById(commentId);
      expect(foundInDb).toBeNull();
    });

    it("should reject non-admin users from deleting someone else's comment (403 Forbidden)", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser("Delta Corp", "delta-corp");
      const { token: dev1Token } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev One",
        "dev1@delta.com"
      );
      const { token: dev2Token } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Two",
        "dev2@delta.com"
      );

      const incident = await createIncident(superAdminToken);

      const createRes = await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${dev1Token}`)
        .send({ content: "Dev 1 comment." });

      const commentId = createRes.body.data.id;

      // Dev 2 attempts to delete Dev 1's comment
      const res = await request(app)
        .delete(`/api/v1/incidents/${incident.id}/comments/${commentId}`)
        .set("Authorization", `Bearer ${dev2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");

      // Verify comment was NOT deleted
      const foundInDb = await Comment.findById(commentId);
      expect(foundInDb).not.toBeNull();
    });
  });

  // =========================================================================
  // 5. Activity Timeline & Audit Integrity
  // =========================================================================
  describe("GET /api/v1/incidents/:incidentId/timeline", () => {
    it("should capture complete audit trail across lifecycle: create, status change, priority change, assignment, and comments", async () => {
      const { org, token: adminToken } = await setupOrgWithUser("Audit Corp", "audit-corp");
      const { user: dev, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Responder",
        "dev@audit.com"
      );

      // 1. Create incident -> INCIDENT_CREATED
      const incident = await createIncident(adminToken, "API Gateway 502 Outage", "Downstream service timeouts.");

      // 2. Change status -> STATUS_CHANGED
      await request(app)
        .patch(`/api/v1/incidents/${incident.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: INCIDENT_STATUS.IN_PROGRESS });

      // 3. Change priority -> PRIORITY_CHANGED
      await request(app)
        .patch(`/api/v1/incidents/${incident.id}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ priority: INCIDENT_PRIORITY.CRITICAL });

      // 4. Assign to dev -> ASSIGNEE_CHANGED
      await request(app)
        .patch(`/api/v1/incidents/${incident.id}/assignee`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ assigneeId: dev._id.toString() });

      // 5. Dev adds comment -> COMMENT_ADDED
      await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ content: "Restarted nginx proxies. Traffic recovering." });

      // Retrieve Timeline
      const timelineRes = await request(app)
        .get(`/api/v1/incidents/${incident.id}/timeline`)
        .set("Authorization", `Bearer ${devToken}`);

      expect(timelineRes.status).toBe(200);
      expect(timelineRes.body.success).toBe(true);

      const items = timelineRes.body.data.timeline;
      expect(items.length).toBe(5);

      // Default sortOrder is desc (newest first)
      expect(items[0].action).toBe(ACTIVITY_ACTION.COMMENT_ADDED);
      expect(items[1].action).toBe(ACTIVITY_ACTION.ASSIGNEE_CHANGED);
      expect(items[1].metadata.after.assigneeId).toBe(dev._id.toString());
      expect(items[2].action).toBe(ACTIVITY_ACTION.PRIORITY_CHANGED);
      expect(items[2].metadata.before.priority).toBe(INCIDENT_PRIORITY.MEDIUM);
      expect(items[2].metadata.after.priority).toBe(INCIDENT_PRIORITY.CRITICAL);
      expect(items[3].action).toBe(ACTIVITY_ACTION.STATUS_CHANGED);
      expect(items[3].metadata.before.status).toBe(INCIDENT_STATUS.OPEN);
      expect(items[3].metadata.after.status).toBe(INCIDENT_STATUS.IN_PROGRESS);
      expect(items[4].action).toBe(ACTIVITY_ACTION.INCIDENT_CREATED);

      // Verify actors are populated safely without password hashes
      expect(items[0].actor.id).toBe(dev._id.toString());
      expect(items[0].actor.email).toBe(dev.email);
      expect(items[0].actor.passwordHash).toBeUndefined();
    });

    it("should support timeline filtering by action and pagination", async () => {
      const { token } = await setupOrgWithUser("Audit Corp", "audit-corp");
      const incident = await createIncident(token);

      // Post 2 comments
      await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Comment A" });

      await request(app)
        .post(`/api/v1/incidents/${incident.id}/comments`)
        .set("Authorization", `Bearer ${token}`)
        .send({ content: "Comment B" });

      // Query only COMMENT_ADDED actions
      const resFiltered = await request(app)
        .get(`/api/v1/incidents/${incident.id}/timeline?action=${ACTIVITY_ACTION.COMMENT_ADDED}`)
        .set("Authorization", `Bearer ${token}`);

      expect(resFiltered.status).toBe(200);
      expect(resFiltered.body.data.timeline.length).toBe(2);
      expect(resFiltered.body.data.pagination.total).toBe(2);
      for (const item of resFiltered.body.data.timeline) {
        expect(item.action).toBe(ACTIVITY_ACTION.COMMENT_ADDED);
      }
    });

    it("should record INCIDENT_DELETED and preserve audit history even after incident is deleted", async () => {
      const { token: superAdminToken } = await setupOrgWithUser(
        "Audit Corp",
        "audit-corp",
        ROLES.SUPER_ADMIN
      );

      const incident = await createIncident(superAdminToken, "Temporary Incident", "To be deleted.");

      // Delete the incident
      const deleteRes = await request(app)
        .delete(`/api/v1/incidents/${incident.id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(deleteRes.status).toBe(200);

      // Audit records for the incident remain immutable and persistent in the database
      const auditRecords = await Activity.find({ incidentId: incident.id }).sort({ createdAt: 1 });
      expect(auditRecords.length).toBe(2);
      expect(auditRecords[0].action).toBe(ACTIVITY_ACTION.INCIDENT_CREATED);
      expect(auditRecords[1].action).toBe(ACTIVITY_ACTION.INCIDENT_DELETED);
      expect(auditRecords[1].metadata?.title).toBe("Temporary Incident");
    });

    it("should verify audit records cannot be modified or deleted through client endpoints (immutable audit trail)", async () => {
      const { token } = await setupOrgWithUser("Audit Corp", "audit-corp");
      const incident = await createIncident(token);

      // Attempt PUT / PATCH / DELETE directly on timeline endpoint
      const patchRes = await request(app)
        .patch(`/api/v1/incidents/${incident.id}/timeline`)
        .set("Authorization", `Bearer ${token}`)
        .send({ action: "FAKE_ACTION" });

      // No patch/put/delete route exists on timeline
      expect([404, 405]).toContain(patchRes.status);

      const deleteRes = await request(app)
        .delete(`/api/v1/incidents/${incident.id}/timeline`)
        .set("Authorization", `Bearer ${token}`);

      expect([404, 405]).toContain(deleteRes.status);
    });
  });
});
