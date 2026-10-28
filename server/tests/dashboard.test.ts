import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { incidentDao } from "../src/dao/incidentDao";
import { activityDao } from "../src/dao/activityDao";
import {
  ROLES,
  Role,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  ACTIVITY_ACTION,
} from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Dashboard & Reporting API (/api/v1/dashboard)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  const setupOrgWithUser = async (
    orgName = "Acme Corp",
    slug = "acme-corp",
    role: Role = ROLES.SUPER_ADMIN,
    isActive = true
  ) => {
    const org = await organizationDao.create({ name: orgName, slug });
    const user = await userDao.create({
      name: `${role} User`,
      email: `${role.toLowerCase()}_${Date.now()}@${slug}.com`,
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

  const createMember = async (
    orgId: string,
    role: Role,
    name: string,
    email: string,
    isActive = true
  ) => {
    return await userDao.create({
      name,
      email,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: orgId,
      isActive,
    });
  };

  describe("A. GET /api/v1/dashboard/overview", () => {
    it("1. Returns all 0s for empty dataset", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/overview")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        criticalUnresolved: 0,
        createdInRange: 0,
        resolvedInRange: 0,
      });
    });

    it("2. Returns accurate metrics for mixed incidents", async () => {
      const { org, user, token } = await setupOrgWithUser();

      // Create incidents with various statuses & priorities
      // 1: Open, High
      await incidentDao.create({
        title: "Incident 1",
        description: "Open incident",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
      });

      // 2: Open, Critical (critical unresolved)
      await incidentDao.create({
        title: "Incident 2",
        description: "Critical open",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
      });

      // 3: In Progress, Critical (critical unresolved)
      await incidentDao.create({
        title: "Incident 3",
        description: "Critical in-progress",
        status: INCIDENT_STATUS.IN_PROGRESS,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
      });

      // 4: Resolved, Critical (should NOT count as critical unresolved)
      await incidentDao.create({
        title: "Incident 4",
        description: "Resolved critical",
        status: INCIDENT_STATUS.RESOLVED,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
        resolvedAt: new Date(),
      });

      // 5: Closed, Low
      await incidentDao.create({
        title: "Incident 5",
        description: "Closed incident",
        status: INCIDENT_STATUS.CLOSED,
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .get("/api/v1/dashboard/overview")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.total).toBe(5);
      expect(res.body.data.open).toBe(2);
      expect(res.body.data.inProgress).toBe(1);
      expect(res.body.data.resolved).toBe(1);
      expect(res.body.data.closed).toBe(1);
      expect(res.body.data.criticalUnresolved).toBe(2);
    });

    it("3. Scopes date range filtering accurately", async () => {
      const { org, user, token } = await setupOrgWithUser();

      // Today
      await incidentDao.create({
        title: "Recent Incident",
        description: "Desc",
        status: INCIDENT_STATUS.RESOLVED,
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
        resolvedAt: new Date(),
      });

      const today = new Date().toISOString().split("T")[0];

      const res = await request(app)
        .get(`/api/v1/dashboard/overview?startDate=${today}&endDate=${today}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.createdInRange).toBe(1);
      expect(res.body.data.resolvedInRange).toBe(1);
    });
  });

  describe("B. GET /api/v1/dashboard/incidents-by-status", () => {
    it("1. Returns all status keys even with 0 counts", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/incidents-by-status")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.statusCounts).toEqual({
        OPEN: 0,
        IN_PROGRESS: 0,
        RESOLVED: 0,
        CLOSED: 0,
      });
      expect(res.body.data.total).toBe(0);
    });

    it("2. Accurately groups incidents by status", async () => {
      const { org, user, token } = await setupOrgWithUser();

      await incidentDao.create({
        title: "Inc 1",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
      });

      await incidentDao.create({
        title: "Inc 2",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
      });

      await incidentDao.create({
        title: "Inc 3",
        description: "Desc",
        status: INCIDENT_STATUS.IN_PROGRESS,
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .get("/api/v1/dashboard/incidents-by-status")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.statusCounts.OPEN).toBe(2);
      expect(res.body.data.statusCounts.IN_PROGRESS).toBe(1);
      expect(res.body.data.statusCounts.RESOLVED).toBe(0);
      expect(res.body.data.statusCounts.CLOSED).toBe(0);
      expect(res.body.data.total).toBe(3);
    });
  });

  describe("C. GET /api/v1/dashboard/incidents-by-priority", () => {
    it("1. Returns all priority keys even with 0 counts", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/incidents-by-priority")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.priorityCounts).toEqual({
        LOW: 0,
        MEDIUM: 0,
        HIGH: 0,
        CRITICAL: 0,
      });
      expect(res.body.data.total).toBe(0);
    });

    it("2. Accurately groups incidents by priority", async () => {
      const { org, user, token } = await setupOrgWithUser();

      await incidentDao.create({
        title: "Inc 1",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
      });

      await incidentDao.create({
        title: "Inc 2",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
      });

      await incidentDao.create({
        title: "Inc 3",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.MEDIUM,
        organizationId: org._id,
        createdBy: user._id,
      });

      const res = await request(app)
        .get("/api/v1/dashboard/incidents-by-priority")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.priorityCounts.CRITICAL).toBe(2);
      expect(res.body.data.priorityCounts.MEDIUM).toBe(1);
      expect(res.body.data.priorityCounts.LOW).toBe(0);
      expect(res.body.data.priorityCounts.HIGH).toBe(0);
      expect(res.body.data.total).toBe(3);
    });
  });

  describe("D. GET /api/v1/dashboard/incident-trends", () => {
    it("1. Defaults to last 30 days and returns continuous daily points", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/incident-trends")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.trends)).toBe(true);
      expect(res.body.data.trends.length).toBe(30);
      expect(res.body.data.trends[0]).toHaveProperty("date");
      expect(res.body.data.trends[0]).toHaveProperty("created");
      expect(res.body.data.trends[0]).toHaveProperty("resolved");
    });

    it("2. Accurately counts created and resolved incidents on specific date", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const today = new Date().toISOString().split("T")[0];

      await incidentDao.create({
        title: "Today Inc",
        description: "Desc",
        status: INCIDENT_STATUS.RESOLVED,
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
        resolvedAt: new Date(),
      });

      const res = await request(app)
        .get(`/api/v1/dashboard/incident-trends?startDate=${today}&endDate=${today}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.trends.length).toBe(1);
      expect(res.body.data.trends[0].date).toBe(today);
      expect(res.body.data.trends[0].created).toBe(1);
      expect(res.body.data.trends[0].resolved).toBe(1);
    });

    it("3. Validates that startDate is not after endDate", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/incident-trends?startDate=2026-10-15&endDate=2026-10-10")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error)).toContain("startDate cannot be after endDate");
    });

    it("4. Enforces max date range limit (<= 90 days)", async () => {
      const { token } = await setupOrgWithUser();

      const res = await request(app)
        .get("/api/v1/dashboard/incident-trends?startDate=2026-01-01&endDate=2026-06-01")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.error)).toContain("Date range cannot exceed 90 days");
    });
  });

  describe("E. GET /api/v1/dashboard/team-workload", () => {
    it("1. Returns active workload per member and omits passwordHash", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const dev1 = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Alice",
        "alice@acme.com"
      );

      const dev2 = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Bob",
        "bob@acme.com"
      );

      // Deactivated member should NOT appear in workload
      await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Inactive",
        "inactive@acme.com",
        false
      );

      // Alice: 1 Open, 1 In Progress
      await incidentDao.create({
        title: "Alice Task 1",
        description: "Desc",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.MEDIUM,
        organizationId: org._id,
        createdBy: user._id,
        assigneeId: dev1._id,
      });

      await incidentDao.create({
        title: "Alice Task 2",
        description: "Desc",
        status: INCIDENT_STATUS.IN_PROGRESS,
        priority: INCIDENT_PRIORITY.HIGH,
        organizationId: org._id,
        createdBy: user._id,
        assigneeId: dev1._id,
      });

      // Resolved task should NOT count toward active unresolved workload
      await incidentDao.create({
        title: "Alice Task 3 Resolved",
        description: "Desc",
        status: INCIDENT_STATUS.RESOLVED,
        priority: INCIDENT_PRIORITY.LOW,
        organizationId: org._id,
        createdBy: user._id,
        assigneeId: dev1._id,
      });

      const res = await request(app)
        .get("/api/v1/dashboard/team-workload")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.totalMembers).toBe(3); // superAdmin + alice + bob

      const aliceWorkload = res.body.data.teamWorkload.find(
        (w: any) => w.member.id === dev1._id.toString()
      );
      expect(aliceWorkload).toBeDefined();
      expect(aliceWorkload.open).toBe(1);
      expect(aliceWorkload.inProgress).toBe(1);
      expect(aliceWorkload.totalUnresolved).toBe(2);

      // Bob has 0
      const bobWorkload = res.body.data.teamWorkload.find(
        (w: any) => w.member.id === dev2._id.toString()
      );
      expect(bobWorkload).toBeDefined();
      expect(bobWorkload.totalUnresolved).toBe(0);

      // Verify NO passwordHash or tokens leak
      for (const item of res.body.data.teamWorkload) {
        expect(item.member.passwordHash).toBeUndefined();
        expect(item.member.token).toBeUndefined();
      }
    });
  });

  describe("F. GET /api/v1/dashboard/recent-activity", () => {
    it("1. Returns recent activity events with pagination and metadata", async () => {
      const { org, user, token } = await setupOrgWithUser();

      const inc = await incidentDao.create({
        title: "Server Down",
        description: "Production incident",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: org._id,
        createdBy: user._id,
      });

      await activityDao.create({
        organizationId: org._id,
        incidentId: inc._id,
        actorId: user._id,
        action: ACTIVITY_ACTION.INCIDENT_CREATED,
        metadata: { title: inc.title },
      });

      await activityDao.create({
        organizationId: org._id,
        incidentId: inc._id,
        actorId: user._id,
        action: ACTIVITY_ACTION.STATUS_CHANGED,
        metadata: { before: { status: "OPEN" }, after: { status: "IN_PROGRESS" } },
      });

      const res = await request(app)
        .get("/api/v1/dashboard/recent-activity?page=1&limit=10")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.activities.length).toBe(2);
      expect(res.body.data.activities[0].action).toBe(ACTIVITY_ACTION.STATUS_CHANGED); // Most recent first
      expect(res.body.data.activities[0].actor.name).toBe(user.name);
      expect(res.body.data.activities[0].incident.title).toBe("Server Down");
      expect(res.body.data.pagination.total).toBe(2);
      expect(res.body.data.pagination.page).toBe(1);
    });
  });

  describe("G. Security & Multi-Tenant Isolation", () => {
    it("1. Rejects unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/dashboard/overview");
      expect(res.status).toBe(401);
    });

    it("2. Rejects deactivated users with 401", async () => {
      const { token } = await setupOrgWithUser("Inactive Org", "inactive-org", ROLES.DEVELOPER, false);

      const res = await request(app)
        .get("/api/v1/dashboard/overview")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it("3. Enforces strict cross-organization data isolation on all dashboard endpoints", async () => {
      const orgA = await setupOrgWithUser("Org Alpha", "org-alpha");
      const orgB = await setupOrgWithUser("Org Beta", "org-beta");

      // Org Alpha creates incidents and activity
      const incAlpha = await incidentDao.create({
        title: "Alpha Secret Incident",
        description: "Confidential",
        status: INCIDENT_STATUS.OPEN,
        priority: INCIDENT_PRIORITY.CRITICAL,
        organizationId: orgA.org._id,
        createdBy: orgA.user._id,
      });

      await activityDao.create({
        organizationId: orgA.org._id,
        incidentId: incAlpha._id,
        actorId: orgA.user._id,
        action: ACTIVITY_ACTION.INCIDENT_CREATED,
        metadata: { title: "Alpha Secret" },
      });

      // Org Beta queries overview
      const overviewResB = await request(app)
        .get("/api/v1/dashboard/overview")
        .set("Authorization", `Bearer ${orgB.token}`);

      expect(overviewResB.body.data.total).toBe(0);
      expect(overviewResB.body.data.criticalUnresolved).toBe(0);

      // Org Beta queries status distribution
      const statusResB = await request(app)
        .get("/api/v1/dashboard/incidents-by-status")
        .set("Authorization", `Bearer ${orgB.token}`);
      expect(statusResB.body.data.total).toBe(0);

      // Org Beta queries priority distribution
      const priorityResB = await request(app)
        .get("/api/v1/dashboard/incidents-by-priority")
        .set("Authorization", `Bearer ${orgB.token}`);
      expect(priorityResB.body.data.total).toBe(0);

      // Org Beta queries team workload
      const workloadResB = await request(app)
        .get("/api/v1/dashboard/team-workload")
        .set("Authorization", `Bearer ${orgB.token}`);
      expect(workloadResB.body.data.totalMembers).toBe(1); // Only Org B user
      expect(workloadResB.body.data.teamWorkload[0].member.name).toBe(orgB.user.name);
      expect(workloadResB.body.data.teamWorkload[0].totalUnresolved).toBe(0);

      // Org Beta queries recent activity
      const activityResB = await request(app)
        .get("/api/v1/dashboard/recent-activity")
        .set("Authorization", `Bearer ${orgB.token}`);
      expect(activityResB.body.data.activities.length).toBe(0);
    });
  });
});
