import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES, Role, INCIDENT_STATUS, INCIDENT_PRIORITY } from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Incident Management API (/api/v1/incidents)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // Helper to bootstrap an organization with a user and return access token
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

  // Helper to create an additional member in an organization
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

  // ==========================================
  // 1. Incident Creation & Validation
  // ==========================================
  describe("POST /api/v1/incidents", () => {
    it("should successfully create an incident with minimal valid payload", async () => {
      const { org, user, token } = await setupOrgWithUser("Alpha Inc", "alpha-inc", ROLES.DEVELOPER);

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Database connection timeout",
          description: "Primary replica node is failing health checks.",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.title).toBe("Database connection timeout");
      expect(res.body.data.description).toBe("Primary replica node is failing health checks.");
      expect(res.body.data.status).toBe(INCIDENT_STATUS.OPEN);
      expect(res.body.data.priority).toBe(INCIDENT_PRIORITY.MEDIUM);
      expect(res.body.data.organizationId).toBe(org._id.toString());
      expect(res.body.data.createdBy.id).toBe(user._id.toString());
      expect(res.body.data.createdBy.email).toBe(user.email);
      expect(res.body.data.assignee).toBeNull();
    });

    it("should create an incident with custom priority, status, and valid assignee", async () => {
      const { org, token } = await setupOrgWithUser("Alpha Inc", "alpha-inc", ROLES.SUPER_ADMIN);
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Lead",
        "dev@alpha.com"
      );

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Payment Gateway Down",
          description: "Stripe webhook endpoints returning 500.",
          priority: INCIDENT_PRIORITY.CRITICAL,
          status: INCIDENT_STATUS.IN_PROGRESS,
          assigneeId: dev._id.toString(),
        });

      expect(res.status).toBe(201);
      expect(res.body.data.priority).toBe(INCIDENT_PRIORITY.CRITICAL);
      expect(res.body.data.status).toBe(INCIDENT_STATUS.IN_PROGRESS);
      expect(res.body.data.assignee.id).toBe(dev._id.toString());
      expect(res.body.data.assignee.name).toBe("Dev Lead");
    });

    it("should reject creation when required fields are missing or invalid", async () => {
      const { token } = await setupOrgWithUser("Alpha Inc", "alpha-inc");

      // Missing title and description
      const res1 = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(res1.status).toBe(400);
      expect(res1.body.error.code).toBe("VALIDATION_ERROR");

      // Title too short
      const res2 = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "A",
          description: "Valid description here",
        });

      expect(res2.status).toBe(400);
      expect(res2.body.error.code).toBe("VALIDATION_ERROR");

      // Invalid status value
      const res3 = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Valid Title",
          description: "Valid description",
          status: "INVALID_STATUS",
        });

      expect(res3.status).toBe(400);
      expect(res3.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject attempts to inject client-supplied organizationId or createdBy", async () => {
      const { token } = await setupOrgWithUser("Alpha Inc", "alpha-inc");

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Legitimate Title",
          description: "Legitimate description",
          organizationId: "64f123456789abcdef012345",
          createdBy: "64f123456789abcdef012345",
        });

      // Strict validation must reject unknown/injected fields
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject assignment to an assignee in a different organization", async () => {
      const { token: tokenOrg1 } = await setupOrgWithUser("Org One", "org-one");
      const { org: org2 } = await setupOrgWithUser("Org Two", "org-two");
      const { user: userInOrg2 } = await createMember(
        org2._id.toString(),
        ROLES.DEVELOPER,
        "User 2",
        "user2@org-two.com"
      );

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${tokenOrg1}`)
        .send({
          title: "Cross-tenant Assignment Attempt",
          description: "Assignee belongs to Org Two",
          assigneeId: userInOrg2._id.toString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toContain("organization");
    });

    it("should reject assignment to a deactivated user", async () => {
      const { org, token } = await setupOrgWithUser("Alpha Inc", "alpha-inc");
      const { user: inactiveUser } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Inactive Dev",
        "inactive@alpha.com",
        false // deactivated
      );

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Assign to Deactivated User",
          description: "Should fail validation",
          assigneeId: inactiveUser._id.toString(),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toContain("deactivated");
    });

    it("should reject DEVELOPER attempts to create an incident with CRITICAL priority with 403", async () => {
      const { token } = await setupOrgWithUser("Alpha Inc", "alpha-inc", ROLES.DEVELOPER);

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Critical Attempt by Developer",
          description: "Developers cannot declare P1 Critical",
          priority: INCIDENT_PRIORITY.CRITICAL,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject DEVELOPER attempts to create an incident in CLOSED status with 403", async () => {
      const { token } = await setupOrgWithUser("Alpha Inc", "alpha-inc", ROLES.DEVELOPER);

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Closed Attempt by Developer",
          description: "Developers cannot create closed incidents",
          status: INCIDENT_STATUS.CLOSED,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject DEVELOPER attempts to assign an incident to SUPER_ADMIN with 403", async () => {
      const { org, user: superAdmin } = await setupOrgWithUser("Alpha Inc", "alpha-inc", ROLES.SUPER_ADMIN);
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Joe",
        "joe@alpha.com"
      );

      const res = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          title: "Assigning upward to superadmin",
          description: "Developers should not be able to assign to superadmin",
          assigneeId: superAdmin._id.toString(),
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 2. Incident Retrieval & Tenant Scoping
  // ==========================================
  describe("GET /api/v1/incidents/:incidentId", () => {
    it("should successfully retrieve an incident by ID within caller's organization", async () => {
      const { token } = await setupOrgWithUser("Beta Corp", "beta-corp", ROLES.DEVELOPER);

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Memory leak in auth service",
          description: "Pod OOM killed every 30 minutes.",
        });

      const incidentId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(incidentId);
      expect(res.body.data.title).toBe("Memory leak in auth service");
    });

    it("should return 404 when querying an incident belonging to another organization", async () => {
      const { token: tokenA } = await setupOrgWithUser("Org A", "org-a");
      const { token: tokenB } = await setupOrgWithUser("Org B", "org-b");

      // Create incident in Org A
      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          title: "Confidential Org A incident",
          description: "Should not be visible to Org B",
        });

      const incidentIdA = createRes.body.data.id;

      // Caller from Org B tries to read incident from Org A
      const res = await request(app)
        .get(`/api/v1/incidents/${incidentIdA}`)
        .set("Authorization", `Bearer ${tokenB}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 400 for malformed MongoDB incidentId", async () => {
      const { token } = await setupOrgWithUser("Beta Corp", "beta-corp");

      const res = await request(app)
        .get("/api/v1/incidents/invalid-hex-id-123")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 3. Incident Listing, Pagination, Filters & Search
  // ==========================================
  describe("GET /api/v1/incidents", () => {
    it("should list incidents scoped to caller's organization with pagination metadata", async () => {
      const { token } = await setupOrgWithUser("Query Corp", "query-corp");

      // Create 3 incidents in Query Corp
      for (let i = 1; i <= 3; i++) {
        await request(app)
          .post("/api/v1/incidents")
          .set("Authorization", `Bearer ${token}`)
          .send({
            title: `Incident ${i}`,
            description: `Description ${i}`,
          });
      }

      const res = await request(app)
        .get("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.incidents.length).toBe(3);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.pagination.totalPages).toBe(1);
    });

    it("should support pagination parameters (page and limit)", async () => {
      const { token } = await setupOrgWithUser("Paging Corp", "paging-corp");

      for (let i = 1; i <= 5; i++) {
        await request(app)
          .post("/api/v1/incidents")
          .set("Authorization", `Bearer ${token}`)
          .send({
            title: `Issue ${i}`,
            description: `Detailed description for issue ${i}`,
          });
      }

      // Page 2 with limit 2 -> expect 2 items
      const res = await request(app)
        .get("/api/v1/incidents?page=2&limit=2")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.incidents.length).toBe(2);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBe(5);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it("should filter by status and priority", async () => {
      const { token } = await setupOrgWithUser("Filter Corp", "filter-corp");

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Critical Outage",
          description: "High impact",
          priority: INCIDENT_PRIORITY.CRITICAL,
          status: INCIDENT_STATUS.OPEN,
        });

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Low bug",
          description: "Low impact",
          priority: INCIDENT_PRIORITY.LOW,
          status: INCIDENT_STATUS.RESOLVED,
        });

      // Filter by priority=CRITICAL
      const resPriority = await request(app)
        .get(`/api/v1/incidents?priority=${INCIDENT_PRIORITY.CRITICAL}`)
        .set("Authorization", `Bearer ${token}`);

      expect(resPriority.status).toBe(200);
      expect(resPriority.body.data.incidents.length).toBe(1);
      expect(resPriority.body.data.incidents[0].title).toBe("Critical Outage");

      // Filter by status=RESOLVED
      const resStatus = await request(app)
        .get(`/api/v1/incidents?status=${INCIDENT_STATUS.RESOLVED}`)
        .set("Authorization", `Bearer ${token}`);

      expect(resStatus.status).toBe(200);
      expect(resStatus.body.data.incidents.length).toBe(1);
      expect(resStatus.body.data.incidents[0].title).toBe("Low bug");
    });

    it("should filter by search keyword (title or description)", async () => {
      const { token } = await setupOrgWithUser("Search Corp", "search-corp");

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Redis Cluster eviction failure",
          description: "Cache misses spiking.",
        });

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Kubernetes ingress SSL expired",
          description: "Certificate renewal script did not trigger.",
        });

      const res = await request(app)
        .get("/api/v1/incidents?search=redis")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.incidents.length).toBe(1);
      expect(res.body.data.incidents[0].title).toContain("Redis");
    });

    it("should support sorting by allowed fields and sortOrder", async () => {
      const { token } = await setupOrgWithUser("Sort Corp", "sort-corp");

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Incident A", description: "First" });

      await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({ title: "Incident B", description: "Second" });

      // Sort by title asc
      const resAsc = await request(app)
        .get("/api/v1/incidents?sortBy=title&sortOrder=asc")
        .set("Authorization", `Bearer ${token}`);

      expect(resAsc.status).toBe(200);
      expect(resAsc.body.data.incidents[0].title).toBe("Incident A");
      expect(resAsc.body.data.incidents[1].title).toBe("Incident B");

      // Sort by title desc
      const resDesc = await request(app)
        .get("/api/v1/incidents?sortBy=title&sortOrder=desc")
        .set("Authorization", `Bearer ${token}`);

      expect(resDesc.status).toBe(200);
      expect(resDesc.body.data.incidents[0].title).toBe("Incident B");
      expect(resDesc.body.data.incidents[1].title).toBe("Incident A");
    });
  });

  // ==========================================
  // 4. Updating Incidents
  // ==========================================
  describe("PATCH /api/v1/incidents/:incidentId", () => {
    it("should allow ADMIN to update incident title, description, status, and priority", async () => {
      const { token } = await setupOrgWithUser("Update Corp", "update-corp", ROLES.ADMIN);

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Initial Title",
          description: "Initial description",
          status: INCIDENT_STATUS.OPEN,
          priority: INCIDENT_PRIORITY.LOW,
        });

      const incidentId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Updated Title",
          status: INCIDENT_STATUS.RESOLVED,
          priority: INCIDENT_PRIORITY.HIGH,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe("Updated Title");
      expect(res.body.data.status).toBe(INCIDENT_STATUS.RESOLVED);
      expect(res.body.data.priority).toBe(INCIDENT_PRIORITY.HIGH);
      expect(res.body.data.description).toBe("Initial description"); // unchanged
    });

    it("should reject DEVELOPER attempts to modify incident severity (priority) with 403", async () => {
      const { org, token: adminToken } = await setupOrgWithUser("Update Corp", "update-corp", ROLES.ADMIN);
      const { user: devUser, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Guy",
        "dev@update.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Incident created by admin",
          description: "Details here",
          priority: INCIDENT_PRIORITY.LOW,
        });

      const incidentId = createRes.body.data.id;

      // Developer tries to change priority
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ priority: INCIDENT_PRIORITY.CRITICAL });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject DEVELOPER attempts to close an incident with 403", async () => {
      const { token: devToken } = await setupOrgWithUser("Update Corp", "update-corp", ROLES.DEVELOPER);

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          title: "Dev created incident",
          description: "Details here",
          status: INCIDENT_STATUS.OPEN,
        });

      const incidentId = createRes.body.data.id;

      // Developer tries to close incident
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ status: INCIDENT_STATUS.CLOSED });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should allow incident creator (DEVELOPER) to update status to RESOLVED", async () => {
      const { token: devToken } = await setupOrgWithUser("Update Corp", "update-corp", ROLES.DEVELOPER);

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          title: "Dev created incident",
          description: "Details here",
          status: INCIDENT_STATUS.OPEN,
        });

      const incidentId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ status: INCIDENT_STATUS.RESOLVED });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(INCIDENT_STATUS.RESOLVED);
    });

    it("should reject updating protected fields like organizationId or createdBy", async () => {
      const { token } = await setupOrgWithUser("Update Corp", "update-corp");

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Sample Incident",
          description: "Sample description",
        });

      const incidentId = createRes.body.data.id;

      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Valid title",
          organizationId: "64f123456789abcdef012345",
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return 404 when updating an incident from another organization", async () => {
      const { token: tokenA } = await setupOrgWithUser("Org A", "org-a");
      const { token: tokenB } = await setupOrgWithUser("Org B", "org-b");

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${tokenA}`)
        .send({
          title: "Org A Incident",
          description: "Org A description",
        });

      const res = await request(app)
        .patch(`/api/v1/incidents/${createRes.body.data.id}`)
        .set("Authorization", `Bearer ${tokenB}`)
        .send({ title: "Tampered Title" });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 5. Assignee Management
  // ==========================================
  describe("PATCH /api/v1/incidents/:incidentId/assignee", () => {
    it("should assign and reassign incident to an active organization member", async () => {
      const { org, token } = await setupOrgWithUser("Assign Corp", "assign-corp");
      const { user: dev1 } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev One",
        "dev1@assign.com"
      );
      const { user: dev2 } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Two",
        "dev2@assign.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Triage Incident",
          description: "Needs investigation",
        });

      const incidentId = createRes.body.data.id;

      // Assign to dev1
      const res1 = await request(app)
        .patch(`/api/v1/incidents/${incidentId}/assignee`)
        .set("Authorization", `Bearer ${token}`)
        .send({ assigneeId: dev1._id.toString() });

      expect(res1.status).toBe(200);
      expect(res1.body.data.assignee.id).toBe(dev1._id.toString());

      // Reassign to dev2
      const res2 = await request(app)
        .patch(`/api/v1/incidents/${incidentId}/assignee`)
        .set("Authorization", `Bearer ${token}`)
        .send({ assigneeId: dev2._id.toString() });

      expect(res2.status).toBe(200);
      expect(res2.body.data.assignee.id).toBe(dev2._id.toString());
    });

    it("should unassign incident when assigneeId is null", async () => {
      const { org, token } = await setupOrgWithUser("Assign Corp", "assign-corp");
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Guy",
        "dev@assign.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${token}`)
        .send({
          title: "Assigned Incident",
          description: "Initially assigned",
          assigneeId: dev._id.toString(),
        });

      const incidentId = createRes.body.data.id;

      // Unassign
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}/assignee`)
        .set("Authorization", `Bearer ${token}`)
        .send({ assigneeId: null });

      expect(res.status).toBe(200);
      expect(res.body.data.assignee).toBeNull();
      expect(res.body.data.assigneeId).toBeNull();
    });

    it("should reject assignment to a cross-organization member", async () => {
      const { token: tokenOrg1 } = await setupOrgWithUser("Org One", "org-one");
      const { org: org2 } = await setupOrgWithUser("Org Two", "org-two");
      const { user: devInOrg2 } = await createMember(
        org2._id.toString(),
        ROLES.DEVELOPER,
        "Dev Two",
        "dev2@org-two.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${tokenOrg1}`)
        .send({
          title: "Incident in Org One",
          description: "Cannot assign to Org Two user",
        });

      const res = await request(app)
        .patch(`/api/v1/incidents/${createRes.body.data.id}/assignee`)
        .set("Authorization", `Bearer ${tokenOrg1}`)
        .send({ assigneeId: devInOrg2._id.toString() });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toContain("organization");
    });

    it("should reject DEVELOPER attempts to reassign incident to SUPER_ADMIN with 403", async () => {
      const { org, user: superAdmin, token: superAdminToken } = await setupOrgWithUser("Assign Corp", "assign-corp", ROLES.SUPER_ADMIN);
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Guy",
        "dev@assign.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          title: "Dev created triage",
          description: "Needs investigation",
        });

      const incidentId = createRes.body.data.id;

      // Dev tries to reassign to superadmin
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}/assignee`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ assigneeId: superAdmin._id.toString() });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject DEVELOPER attempts to reassign an incident already assigned to SUPER_ADMIN with 403", async () => {
      const { org, user: superAdmin, token: superAdminToken } = await setupOrgWithUser("Assign Corp", "assign-corp", ROLES.SUPER_ADMIN);
      const { user: dev1, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev One",
        "dev1@assign.com"
      );

      const createRes = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({
          title: "SuperAdmin incident",
          description: "Assigned to superadmin initially",
          assigneeId: superAdmin._id.toString(),
        });

      const incidentId = createRes.body.data.id;

      // Dev tries to reassign it away from superadmin to self
      const res = await request(app)
        .patch(`/api/v1/incidents/${incidentId}/assignee`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ assigneeId: dev1._id.toString() });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 6. Deletion Permissions & Authorization
  // ==========================================
  describe("DELETE /api/v1/incidents/:incidentId", () => {
    it("should allow SUPER_ADMIN and ADMIN to delete an incident", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser(
        "Delete Corp",
        "delete-corp",
        ROLES.SUPER_ADMIN
      );
      const { token: adminToken } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin User",
        "admin@delete.com"
      );

      // Create two incidents
      const inc1 = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ title: "Incident 1", description: "To be deleted by Super Admin" });

      const inc2 = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ title: "Incident 2", description: "To be deleted by Admin" });

      // Super Admin deletes inc1
      const res1 = await request(app)
        .delete(`/api/v1/incidents/${inc1.body.data.id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.message).toContain("deleted");

      // Admin deletes inc2
      const res2 = await request(app)
        .delete(`/api/v1/incidents/${inc2.body.data.id}`)
        .set("Authorization", `Bearer ${adminToken}`);

      expect(res2.status).toBe(200);
      expect(res2.body.success).toBe(true);

      // Verify deletion in GET
      const getRes = await request(app)
        .get(`/api/v1/incidents/${inc1.body.data.id}`)
        .set("Authorization", `Bearer ${superAdminToken}`);

      expect(getRes.status).toBe(404);
    });

    it("should reject DEVELOPER and MANAGER from deleting incidents (403 Forbidden)", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser(
        "Delete Guard Corp",
        "delete-guard-corp"
      );
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev User",
        "dev@guard.com"
      );
      const { token: managerToken } = await createMember(
        org._id.toString(),
        ROLES.MANAGER,
        "Manager User",
        "manager@guard.com"
      );

      const inc = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ title: "Audit Log Incident", description: "Must not be deleted by dev" });

      const incidentId = inc.body.data.id;

      // Developer tries to delete
      const resDev = await request(app)
        .delete(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${devToken}`);

      expect(resDev.status).toBe(403);
      expect(resDev.body.error.code).toBe("FORBIDDEN");

      // Manager tries to delete
      const resMgr = await request(app)
        .delete(`/api/v1/incidents/${incidentId}`)
        .set("Authorization", `Bearer ${managerToken}`);

      expect(resMgr.status).toBe(403);
      expect(resMgr.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 7. Access Denial for Deactivated Users
  // ==========================================
  describe("Access Denial for Deactivated Accounts", () => {
    it("should immediately deny deactivated user from incident operations even with valid unexpired token", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser("Deact Corp", "deact-corp");
      const { user: dev, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Active Dev",
        "dev@deact.com"
      );

      // Verify developer can create an incident
      const resBefore = await request(app)
        .post("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          title: "Incident Before Deactivation",
          description: "Created while active",
        });

      expect(resBefore.status).toBe(201);

      // Deactivate developer account
      await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/status`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ isActive: false });

      // Developer attempts to perform incident operation with original valid JWT
      const resAfter = await request(app)
        .get("/api/v1/incidents")
        .set("Authorization", `Bearer ${devToken}`);

      expect(resAfter.status).toBe(401);
      expect(resAfter.body.error.code).toBe("AUTHENTICATION_ERROR");
      expect(resAfter.body.error.message).toContain("deactivated");
    });
  });
});
