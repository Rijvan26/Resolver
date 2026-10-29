import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { incidentDao } from "../src/dao/incidentDao";
import { notificationDao } from "../src/dao/notificationDao";
import { Notification } from "../src/models/Notification";
import { emailDeliveryService } from "../src/services/emailDeliveryService";
import { notificationEventService } from "../src/services/notificationEventService";
import {
  ROLES,
  Role,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  NOTIFICATION_TYPES,
} from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Notifications Module API & Business Events (/api/v1/notifications)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 60000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    emailDeliveryService.setSender(null);
    emailDeliveryService.setTransporter(null);
  });

  afterAll(async () => {
    await teardownTestDb();
    emailDeliveryService.initTransporter();
  });

  // Helper to create an organization with an initial admin user
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

  // Helper to create additional members in an organization
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

  // ========================================================
  // 1. In-App Notification Model & Validation
  // ========================================================
  describe("Notification Model & Schema Validation", () => {
    it("should enforce required fields, strict enum types, and default timestamps", async () => {
      const { org, user } = await setupOrgWithUser();

      const doc = await Notification.create({
        organizationId: org._id,
        recipientId: user._id,
        type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
        title: "Test Assigned",
        message: "You were assigned an incident",
      });

      expect(doc._id).toBeDefined();
      expect(doc.readAt).toBeNull();
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);
      expect(doc.type).toBe(NOTIFICATION_TYPES.INCIDENT_ASSIGNED);
    });

    it("should reject invalid notification types", async () => {
      const { org, user } = await setupOrgWithUser();

      await expect(
        Notification.create({
          organizationId: org._id,
          recipientId: user._id,
          // @ts-expect-error Testing invalid enum value at runtime
          type: "INVALID_ARBITRARY_TYPE",
          title: "Invalid",
          message: "Should fail validation",
        })
      ).rejects.toThrow();
    });
  });

  // ========================================================
  // 2. Notification APIs (Phase 3)
  // ========================================================
  describe("Notification HTTP Endpoints", () => {
    it("GET /api/v1/notifications should require authentication", async () => {
      const res = await request(app).get("/api/v1/notifications");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("GET /api/v1/notifications should return empty list and zero count initially", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toEqual([]);
      expect(res.body.data.pagination.total).toBe(0);
      expect(res.body.data.unreadCount).toBe(0);
    });

    it("GET /api/v1/notifications should support pagination and unread filtering", async () => {
      const { org, user, token } = await setupOrgWithUser();

      // Create 5 notifications: 3 unread, 2 read
      for (let i = 1; i <= 5; i++) {
        await notificationDao.create({
          organizationId: org._id,
          recipientId: user._id,
          type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
          title: `Notification ${i}`,
          message: `Details for notification ${i}`,
        });
      }

      // Mark first two as read
      const all = await notificationDao.findUserNotifications(org._id, user._id);
      await notificationDao.markAsRead(org._id, user._id, all[0]._id);
      await notificationDao.markAsRead(org._id, user._id, all[1]._id);

      // Query page 1 with limit 2
      const page1Res = await request(app)
        .get("/api/v1/notifications?page=1&limit=2")
        .set("Authorization", `Bearer ${token}`);

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.notifications.length).toBe(2);
      expect(page1Res.body.data.pagination.total).toBe(5);
      expect(page1Res.body.data.pagination.totalPages).toBe(3);
      expect(page1Res.body.data.unreadCount).toBe(3);

      // Query unread only
      const unreadRes = await request(app)
        .get("/api/v1/notifications?unread=true")
        .set("Authorization", `Bearer ${token}`);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.data.notifications.length).toBe(3);
      unreadRes.body.data.notifications.forEach((n: { readAt: string | null; isRead: boolean }) => {
        expect(n.readAt).toBeNull();
        expect(n.isRead).toBe(false);
      });
    });

    it("GET /api/v1/notifications/unread-count should return accurate count", async () => {
      const { org, user, token } = await setupOrgWithUser();

      await notificationDao.create({
        organizationId: org._id,
        recipientId: user._id,
        type: NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED,
        title: "Unread 1",
        message: "Status changed",
      });

      await notificationDao.create({
        organizationId: org._id,
        recipientId: user._id,
        type: NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED,
        title: "Unread 2",
        message: "Status changed again",
      });

      const res = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.unreadCount).toBe(2);
    });

    it("PATCH /api/v1/notifications/:id/read should mark single notification as read", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const notif = await notificationDao.create({
        organizationId: org._id,
        recipientId: user._id,
        type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
        title: "To Be Read",
        message: "Please read this",
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${notif._id}/read`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(notif._id.toString());
      expect(res.body.data.readAt).toBeDefined();
      expect(res.body.data.isRead).toBe(true);

      // Verify DB record
      const refreshed = await Notification.findById(notif._id);
      expect(refreshed?.readAt).toBeInstanceOf(Date);
    });

    it("PATCH /api/v1/notifications/read-all should mark all unread notifications as read", async () => {
      const { org, user, token } = await setupOrgWithUser();

      for (let i = 0; i < 3; i++) {
        await notificationDao.create({
          organizationId: org._id,
          recipientId: user._id,
          type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
          title: `Notice ${i}`,
          message: `Notice body ${i}`,
        });
      }

      const res = await request(app)
        .patch("/api/v1/notifications/read-all")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.modifiedCount).toBe(3);

      const countRes = await request(app)
        .get("/api/v1/notifications/unread-count")
        .set("Authorization", `Bearer ${token}`);

      expect(countRes.body.data.unreadCount).toBe(0);
    });

    it("should prevent cross-user and cross-organization access (tenant isolation)", async () => {
      const org1 = await setupOrgWithUser("Org One", "org-one");
      const org2 = await setupOrgWithUser("Org Two", "org-two");

      // Notification belonging to org1 user
      const notifOrg1 = await notificationDao.create({
        organizationId: org1.org._id,
        recipientId: org1.user._id,
        type: NOTIFICATION_TYPES.INCIDENT_ASSIGNED,
        title: "Org 1 Secret",
        message: "Confidential incident details",
      });

      // Org 2 user attempts to mark Org 1 notification as read -> 404 (not found in caller org)
      const resPatch = await request(app)
        .patch(`/api/v1/notifications/${notifOrg1._id}/read`)
        .set("Authorization", `Bearer ${org2.token}`);

      expect(resPatch.status).toBe(404);

      // Org 2 user's notification list does not include Org 1 notifications
      const resList = await request(app)
        .get("/api/v1/notifications")
        .set("Authorization", `Bearer ${org2.token}`);

      expect(resList.body.data.notifications).toHaveLength(0);

      // Same org, different user isolation:
      const memberOrg1 = await createMember(
        org1.org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Two",
        "dev2@org-one.com"
      );

      // Member 2 cannot mark Member 1's notification as read
      const resMemberPatch = await request(app)
        .patch(`/api/v1/notifications/${notifOrg1._id}/read`)
        .set("Authorization", `Bearer ${memberOrg1.token}`);

      expect(resMemberPatch.status).toBe(404);
    });
  });

  // ========================================================
  // 3. Business Event Triggers (Phase 4)
  // ========================================================
  describe("Business Event Notification Triggers", () => {
    it("should create INCIDENT_ASSIGNED notification for assignee on incident creation", async () => {
      const { org, user: creator, token } = await setupOrgWithUser();
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Developer Alice",
        "alice@acme.com"
      );

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Server outage in prod",
          description: "Nginx ingress returning 502 Bad Gateway",
          assigneeId: dev._id.toString(),
        });

      expect(res.status).toBe(201);

      // Verify assignee received notification
      const notifs = await notificationDao.findUserNotifications(org._id, dev._id);
      expect(notifs).toHaveLength(1);
      expect(notifs[0].type).toBe(NOTIFICATION_TYPES.INCIDENT_ASSIGNED);
      expect(notifs[0].title).toBe("Incident Assigned");
      expect(notifs[0].actorId?._id?.toString() || notifs[0].actorId?.toString()).toBe(creator._id.toString());
      expect(notifs[0].incidentId?._id?.toString() || notifs[0].incidentId?.toString()).toBe(res.body.data.id);

      // Creator must NOT receive an assignment notification
      const creatorNotifs = await notificationDao.findUserNotifications(org._id, creator._id);
      expect(creatorNotifs).toHaveLength(0);
    });

    it("should NOT create self-notification when creator assigns incident to themselves", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Self assigned incident",
          description: "Handling this personally",
          assigneeId: user._id.toString(),
        });

      expect(res.status).toBe(201);

      // No self-notification
      const notifs = await notificationDao.findUserNotifications(org._id, user._id);
      expect(notifs).toHaveLength(0);
    });

    it("should create INCIDENT_ASSIGNED notification when assignee is updated", async () => {
      const { org, user: creator, token } = await setupOrgWithUser();
      const { user: dev1 } = await createMember(org._id.toString(), ROLES.DEVELOPER, "Dev 1", "d1@acme.com");
      const { user: dev2 } = await createMember(org._id.toString(), ROLES.DEVELOPER, "Dev 2", "d2@acme.com");

      // Create initially assigned to dev1
      const created = await incidentDao.create({
        organizationId: org._id,
        createdBy: creator._id,
        assigneeId: dev1._id,
        title: "Memory leak in worker",
        description: "Node.js process RSS growing indefinitely",
      });

      // Clear any prior notifications
      await Notification.deleteMany({});

      // Reassign to dev2
      const res = await request(app)
        .patch(`/api/v1/incidents/${created._id}/assignee`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          assigneeId: dev2._id.toString(),
        });

      expect(res.status).toBe(200);

      // New assignee dev2 received notification
      const dev2Notifs = await notificationDao.findUserNotifications(org._id, dev2._id);
      expect(dev2Notifs).toHaveLength(1);
      expect(dev2Notifs[0].type).toBe(NOTIFICATION_TYPES.INCIDENT_ASSIGNED);

      // Re-assigning to the SAME assignee dev2 must NOT generate a duplicate notification
      await request(app)
        .patch(`/api/v1/incidents/${created._id}/assignee`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          assigneeId: dev2._id.toString(),
        });

      const dev2NotifsAfterSame = await notificationDao.findUserNotifications(org._id, dev2._id);
      expect(dev2NotifsAfterSame).toHaveLength(1); // Still 1, no duplicate
    });

    it("should create INCIDENT_STATUS_CHANGED notifications for assignee and creator (excluding actor)", async () => {
      const { org, user: creator, token: creatorToken } = await setupOrgWithUser();
      const { user: assignee, token: assigneeToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Assignee Dev",
        "assignee@acme.com"
      );

      const incident = await incidentDao.create({
        organizationId: org._id,
        createdBy: creator._id,
        assigneeId: assignee._id,
        title: "API latency spike",
        description: "P99 latency exceeding 500ms",
        status: INCIDENT_STATUS.OPEN,
      });

      // Assignee marks status as IN_PROGRESS
      const res = await request(app)
        .patch(`/api/v1/incidents/${incident._id}`)
        .set("Authorization", `Bearer ${assigneeToken}`)
        .send({
          status: INCIDENT_STATUS.IN_PROGRESS,
        });

      expect(res.status).toBe(200);

      // Creator must receive notification about status change
      const creatorNotifs = await notificationDao.findUserNotifications(org._id, creator._id);
      expect(creatorNotifs).toHaveLength(1);
      expect(creatorNotifs[0].type).toBe(NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED);
      expect(creatorNotifs[0].message).toContain("status changed from OPEN to IN_PROGRESS");

      // Assignee made the update, so assignee must NOT receive self-notification
      const assigneeNotifs = await notificationDao.findUserNotifications(org._id, assignee._id);
      expect(assigneeNotifs).toHaveLength(0);
    });

    it("should create INCIDENT_PRIORITY_CHANGED notifications for assignee and creator (excluding actor)", async () => {
      const { org, user: creator, token: creatorToken } = await setupOrgWithUser();
      const { user: assignee } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Assignee Dev",
        "assignee2@acme.com"
      );

      const incident = await incidentDao.create({
        organizationId: org._id,
        createdBy: creator._id,
        assigneeId: assignee._id,
        title: "Redis cache thrashing",
        description: "Eviction rate spiking",
        priority: INCIDENT_PRIORITY.LOW,
      });

      // Creator escalates priority to CRITICAL
      const res = await request(app)
        .patch(`/api/v1/incidents/${incident._id}`)
        .set("Authorization", `Bearer ${creatorToken}`)
        .send({
          priority: INCIDENT_PRIORITY.CRITICAL,
        });

      expect(res.status).toBe(200);

      // Assignee must receive priority changed notification
      const assigneeNotifs = await notificationDao.findUserNotifications(org._id, assignee._id);
      expect(assigneeNotifs).toHaveLength(1);
      expect(assigneeNotifs[0].type).toBe(NOTIFICATION_TYPES.INCIDENT_PRIORITY_CHANGED);
      expect(assigneeNotifs[0].message).toContain("priority changed from LOW to CRITICAL");

      // Creator made the change, no self-notification
      const creatorNotifs = await notificationDao.findUserNotifications(org._id, creator._id);
      expect(creatorNotifs).toHaveLength(0);
    });

    it("should create INCIDENT_COMMENT_ADDED notifications when a comment is posted", async () => {
      const { org, user: creator } = await setupOrgWithUser();
      const { user: dev, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Commenter Dev",
        "dev@acme.com"
      );

      const incident = await incidentDao.create({
        organizationId: org._id,
        createdBy: creator._id,
        title: "Kafka consumer lag",
        description: "Partition 3 lag increasing",
      });

      // Developer adds a comment
      const res = await request(app)
        .post(`/api/v1/incidents/${incident._id}/comments`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          content: "Investigating consumer group offsets right now.",
        });

      expect(res.status).toBe(201);

      // Incident creator receives notification
      const creatorNotifs = await notificationDao.findUserNotifications(org._id, creator._id);
      expect(creatorNotifs).toHaveLength(1);
      expect(creatorNotifs[0].type).toBe(NOTIFICATION_TYPES.INCIDENT_COMMENT_ADDED);
      expect(creatorNotifs[0].message).toContain("Investigating consumer group offsets right now.");

      // Commenter dev must NOT receive self-notification
      const devNotifs = await notificationDao.findUserNotifications(org._id, dev._id);
      expect(devNotifs).toHaveLength(0);
    });

    it("should NOT generate notifications for deactivated or cross-org users", async () => {
      const { org } = await setupOrgWithUser();
      const { user: deactivatedDev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Deactivated Alice",
        "alice-deactivated@acme.com",
        false // isActive = false
      );

      // Attempt assignment event directly
      await notificationEventService.handleIncidentAssigned({
        organizationId: org._id.toString(),
        incidentId: "507f1f77bcf86cd799439011",
        incidentTitle: "Test Incident",
        actorId: "507f1f77bcf86cd799439012",
        newAssigneeId: deactivatedDev._id.toString(),
      });

      // Must be rejected - no notification generated
      const notifs = await notificationDao.findUserNotifications(org._id, deactivatedDev._id);
      expect(notifs).toHaveLength(0);
    });

    it("should NOT create notifications for failed incident operations", async () => {
      const { token } = await setupOrgWithUser();

      // Send invalid payload
      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "", // Invalid: min 2 chars
        });

      expect(res.status).toBe(400);

      // Ensure no notifications exist in database
      const totalNotifs = await Notification.countDocuments({});
      expect(totalNotifs).toBe(0);
    });
  });

  // ========================================================
  // 4. Email Delivery & Retries (Phase 5)
  // ========================================================
  describe("Email Delivery Service & Bounded Retries", () => {
    it("should safely report SKIPPED_NO_PROVIDER when no email sender is configured", async () => {
      emailDeliveryService.setSender(null);

      const result = await emailDeliveryService.sendEmail({
        to: "user@example.com",
        subject: "Test Subject",
        text: "Test content",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("SKIPPED_NO_PROVIDER");
      expect(result.attempts).toBe(0);
    });

    it("should retry transient failures and succeed when custom sender recovers", async () => {
      let attempts = 0;
      emailDeliveryService.setSender(async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("Temporary network timeout");
        }
        return { messageId: "msg-12345" };
      });

      const result = await emailDeliveryService.sendEmail({
        to: "retry@example.com",
        subject: "Retry Test",
        text: "Body",
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe("SENT");
      expect(result.attempts).toBe(2);
      expect(result.messageId).toBe("msg-12345");
    });

    it("should boundedly fail after maxRetries when sender continues to fail", async () => {
      let attempts = 0;
      emailDeliveryService.setSender(async () => {
        attempts++;
        throw new Error("Persistent SMTP connection refused");
      });

      const result = await emailDeliveryService.sendEmail({
        to: "failing@example.com",
        subject: "Fail Test",
        text: "Body",
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe("FAILED");
      expect(result.attempts).toBe(3); // bounded at 3 retries
      expect(result.error).toContain("Persistent SMTP connection refused");
    });
  });

  // ========================================================
  // 5. Idempotency & Deduplication
  // ========================================================
  describe("Event Idempotency & Deduplication", () => {
    it("should not create duplicate in-app notification when same event is processed repeatedly", async () => {
      const { org, user: creator } = await setupOrgWithUser();
      const { user: dev } = await createMember(org._id.toString(), ROLES.DEVELOPER, "Dev", "dev@acme.com");

      const params = {
        organizationId: org._id.toString(),
        incidentId: "507f1f77bcf86cd799439011",
        incidentTitle: "Worker OOM crash",
        actorId: creator._id.toString(),
        newAssigneeId: dev._id.toString(),
        oldAssigneeId: null,
      };

      // Process event once
      await notificationEventService.handleIncidentAssigned(params);

      // Process same event again immediately
      await notificationEventService.handleIncidentAssigned(params);

      // Only 1 notification should exist
      const notifs = await notificationDao.findUserNotifications(org._id, dev._id);
      expect(notifs).toHaveLength(1);
    });
  });
});
