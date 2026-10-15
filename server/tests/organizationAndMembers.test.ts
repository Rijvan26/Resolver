import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES, Role } from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Organization & Member Management API (/api/v1/organizations)", () => {
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

  // ==========================================
  // 1. Organization Details & Scoping
  // ==========================================
  describe("GET /api/v1/organizations/me", () => {
    it("should return the authenticated user's organization profile", async () => {
      const { org, token } = await setupOrgWithUser("Stark Industries", "stark-industries");

      const res = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(org._id.toString());
      expect(res.body.data.name).toBe("Stark Industries");
      expect(res.body.data.slug).toBe("stark-industries");
      expect(res.body.data.statusPageEnabled).toBe(false);
      expect(res.body.data.createdAt).toBeDefined();
    });

    it("should enforce tenant isolation (returns only caller's org)", async () => {
      const { org: org1, token: token1 } = await setupOrgWithUser("Org One", "org-one");
      const { org: org2, token: token2 } = await setupOrgWithUser("Org Two", "org-two");

      const res1 = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token1}`);

      const res2 = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token2}`);

      expect(res1.body.data.id).toBe(org1._id.toString());
      expect(res2.body.data.id).toBe(org2._id.toString());
      expect(res1.body.data.id).not.toBe(res2.body.data.id);
    });

    it("should reject unauthenticated requests with 401", async () => {
      const res = await request(app).get("/api/v1/organizations/me");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
    });
  });

  // ==========================================
  // 2. Organization Settings Update & Validation
  // ==========================================
  describe("PATCH /api/v1/organizations/me", () => {
    it("should allow SUPER_ADMIN to update organization name and statusPageEnabled", async () => {
      const { token } = await setupOrgWithUser("Initial Corp", "initial-corp", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token}`)
        .send({
          name: "Updated Corp Name",
          statusPageEnabled: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Updated Corp Name");
      expect(res.body.data.statusPageEnabled).toBe(true);
    });

    it("should allow ADMIN to update organization settings", async () => {
      const { org } = await setupOrgWithUser("Admin Org", "admin-org", ROLES.SUPER_ADMIN);
      const { token: adminToken } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin",
        "admin@admin-org.com"
      );

      const res = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "Renamed by Admin" });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe("Renamed by Admin");
    });

    it("should deny DEVELOPER and MANAGER from updating organization settings (403)", async () => {
      const { org } = await setupOrgWithUser("Dev Org", "dev-org", ROLES.SUPER_ADMIN);
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@dev-org.com"
      );
      const { token: managerToken } = await createMember(
        org._id.toString(),
        ROLES.MANAGER,
        "Manager",
        "mgr@dev-org.com"
      );

      const resDev = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${devToken}`)
        .send({ name: "Dev Attempt" });

      const resMgr = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({ name: "Mgr Attempt" });

      expect(resDev.status).toBe(403);
      expect(resDev.body.error.code).toBe("FORBIDDEN");
      expect(resMgr.status).toBe(403);
      expect(resMgr.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject update with empty body or unauthorized fields (strict validation)", async () => {
      const { token } = await setupOrgWithUser("Strict Org", "strict-org", ROLES.SUPER_ADMIN);

      // Empty body
      const resEmpty = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token}`)
        .send({});

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error.code).toBe("VALIDATION_ERROR");

      // Unauthorized field (e.g., trying to overwrite slug or _id)
      const resUnauthorizedField = await request(app)
        .patch("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${token}`)
        .send({ slug: "hacked-slug" });

      expect(resUnauthorizedField.status).toBe(400);
      expect(resUnauthorizedField.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 3. Member Listing, Pagination & Filtering
  // ==========================================
  describe("GET /api/v1/organizations/me/members", () => {
    it("should list members with default pagination and without exposing sensitive data", async () => {
      const { org, token } = await setupOrgWithUser("List Org", "list-org", ROLES.SUPER_ADMIN);

      await createMember(org._id.toString(), ROLES.ADMIN, "Alice Admin", "alice@list-org.com");
      await createMember(org._id.toString(), ROLES.DEVELOPER, "Bob Dev", "bob@list-org.com");

      const res = await request(app)
        .get("/api/v1/organizations/me/members")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.members.length).toBe(3);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(10);
      expect(res.body.data.pagination.total).toBe(3);
      expect(res.body.data.pagination.totalPages).toBe(1);

      // Verify no password hashes or internal secrets leak
      res.body.data.members.forEach((m: Record<string, unknown>) => {
        expect(m.passwordHash).toBeUndefined();
        expect(m.password).toBeUndefined();
        expect(m.email).toBeDefined();
        expect(m.role).toBeDefined();
      });
    });

    it("should support pagination parameters (page and limit)", async () => {
      const { org, token } = await setupOrgWithUser("Paging Org", "paging-org", ROLES.SUPER_ADMIN);

      for (let i = 1; i <= 5; i++) {
        await createMember(org._id.toString(), ROLES.DEVELOPER, `Dev ${i}`, `dev${i}@paging.com`);
      }

      // Total members = 6 (1 super admin + 5 devs). Limit 2 -> page 2 should have 2 members.
      const res = await request(app)
        .get("/api/v1/organizations/me/members?page=2&limit=2")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(2);
      expect(res.body.data.pagination.page).toBe(2);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.total).toBe(6);
      expect(res.body.data.pagination.totalPages).toBe(3);
    });

    it("should support filtering by role", async () => {
      const { org, token } = await setupOrgWithUser("Filter Org", "filter-org", ROLES.SUPER_ADMIN);

      await createMember(org._id.toString(), ROLES.ADMIN, "Admin 1", "admin1@filter.com");
      await createMember(org._id.toString(), ROLES.DEVELOPER, "Dev 1", "dev1@filter.com");
      await createMember(org._id.toString(), ROLES.DEVELOPER, "Dev 2", "dev2@filter.com");

      const res = await request(app)
        .get("/api/v1/organizations/me/members?role=DEVELOPER")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(2);
      res.body.data.members.forEach((m: { role: string }) => {
        expect(m.role).toBe(ROLES.DEVELOPER);
      });
    });

    it("should support filtering by status (active / deactivated)", async () => {
      const { org, token } = await setupOrgWithUser("Status Org", "status-org", ROLES.SUPER_ADMIN);

      await createMember(org._id.toString(), ROLES.DEVELOPER, "Active Dev", "active@status.com", true);
      await createMember(org._id.toString(), ROLES.DEVELOPER, "Inactive Dev", "inactive@status.com", false);

      const resActive = await request(app)
        .get("/api/v1/organizations/me/members?status=active")
        .set("Authorization", `Bearer ${token}`);

      expect(resActive.status).toBe(200);
      expect(resActive.body.data.members.length).toBe(2); // Super admin + 1 active dev
      resActive.body.data.members.forEach((m: { isActive: boolean }) => {
        expect(m.isActive).toBe(true);
      });

      const resDeactivated = await request(app)
        .get("/api/v1/organizations/me/members?status=deactivated")
        .set("Authorization", `Bearer ${token}`);

      expect(resDeactivated.status).toBe(200);
      expect(resDeactivated.body.data.members.length).toBe(1);
      expect(resDeactivated.body.data.members[0].isActive).toBe(false);
      expect(resDeactivated.body.data.members[0].email).toBe("inactive@status.com");
    });

    it("should support search by name or email substring", async () => {
      const { org, token } = await setupOrgWithUser("Search Org", "search-org", ROLES.SUPER_ADMIN);

      await createMember(org._id.toString(), ROLES.DEVELOPER, "John Doe", "john@search.com");
      await createMember(org._id.toString(), ROLES.DEVELOPER, "Jane Smith", "jane@search.com");

      const res = await request(app)
        .get("/api/v1/organizations/me/members?search=smith")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.members.length).toBe(1);
      expect(res.body.data.members[0].name).toBe("Jane Smith");
    });
  });

  // ==========================================
  // 4. Viewing Specific Member Details
  // ==========================================
  describe("GET /api/v1/organizations/me/members/:memberId", () => {
    it("should retrieve single member details for organization member", async () => {
      const { org, token } = await setupOrgWithUser("View Org", "view-org", ROLES.SUPER_ADMIN);
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Guy",
        "devguy@view.com"
      );

      const res = await request(app)
        .get(`/api/v1/organizations/me/members/${dev._id.toString()}`)
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(dev._id.toString());
      expect(res.body.data.name).toBe("Dev Guy");
      expect(res.body.data.email).toBe("devguy@view.com");
      expect(res.body.data.role).toBe(ROLES.DEVELOPER);
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it("should return 404 if memberId does not exist in the organization", async () => {
      const { token } = await setupOrgWithUser("View 404 Org", "view-404-org", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get("/api/v1/organizations/me/members/64f123456789abcdef012345")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should return 400 for invalid ObjectId format", async () => {
      const { token } = await setupOrgWithUser("Invalid ID Org", "invalid-id-org", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .get("/api/v1/organizations/me/members/invalid-id")
        .set("Authorization", `Bearer ${token}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  // ==========================================
  // 5. Cross-Organization Access Attempts
  // ==========================================
  describe("Cross-Organization Isolation & Access Control", () => {
    it("should deny viewing members across different organizations (404 tenant isolation)", async () => {
      const { org: orgA, token: tokenA } = await setupOrgWithUser("Org A", "org-a");
      const { org: orgB } = await setupOrgWithUser("Org B", "org-b");

      const { user: memberB } = await createMember(
        orgB._id.toString(),
        ROLES.DEVELOPER,
        "Member B",
        "memberb@org-b.com"
      );

      // Caller from Org A tries to access member in Org B
      const res = await request(app)
        .get(`/api/v1/organizations/me/members/${memberB._id.toString()}`)
        .set("Authorization", `Bearer ${tokenA}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should deny updating role across different organizations (404)", async () => {
      const { token: tokenA } = await setupOrgWithUser("Org A", "org-a");
      const { org: orgB } = await setupOrgWithUser("Org B", "org-b");

      const { user: memberB } = await createMember(
        orgB._id.toString(),
        ROLES.DEVELOPER,
        "Member B",
        "memberb2@org-b.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${memberB._id.toString()}/role`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ role: ROLES.MANAGER });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should deny deactivating members across different organizations (404)", async () => {
      const { token: tokenA } = await setupOrgWithUser("Org A", "org-a");
      const { org: orgB } = await setupOrgWithUser("Org B", "org-b");

      const { user: memberB } = await createMember(
        orgB._id.toString(),
        ROLES.DEVELOPER,
        "Member B",
        "memberb3@org-b.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${memberB._id.toString()}/status`)
        .set("Authorization", `Bearer ${tokenA}`)
        .send({ isActive: false });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // ==========================================
  // 6. Self-Modification Protection
  // ==========================================
  describe("Self-Modification Guards", () => {
    it("should prevent users from changing their own role (403)", async () => {
      const { user, token } = await setupOrgWithUser("Self Org", "self-org", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${user._id.toString()}/role`)
        .set("Authorization", `Bearer ${token}`)
        .send({ role: ROLES.ADMIN });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toContain("own role");
    });

    it("should prevent users from deactivating their own account (403)", async () => {
      const { user, token } = await setupOrgWithUser("Self Deact Org", "self-deact-org", ROLES.SUPER_ADMIN);

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${user._id.toString()}/status`)
        .set("Authorization", `Bearer ${token}`)
        .send({ isActive: false });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toContain("own account");
    });
  });

  // ==========================================
  // 7. Role Management Permissions & Privilege Escalation
  // ==========================================
  describe("Role Management Permissions", () => {
    it("should allow SUPER_ADMIN to change member roles (Developer -> Manager)", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser("Role Org", "role-org", ROLES.SUPER_ADMIN);
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@role.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/role`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ role: ROLES.MANAGER });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe(ROLES.MANAGER);
    });

    it("should allow ADMIN to promote Developer to Manager", async () => {
      const { org } = await setupOrgWithUser("Admin Manage Org", "admin-manage-org", ROLES.SUPER_ADMIN);
      const { token: adminToken } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin",
        "admin@adminmanage.com"
      );
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@adminmanage.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: ROLES.MANAGER });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe(ROLES.MANAGER);
    });

    it("should prevent ADMIN from escalating privileges (promoting to ADMIN or SUPER_ADMIN)", async () => {
      const { org } = await setupOrgWithUser("Escalation Org", "escalation-org", ROLES.SUPER_ADMIN);
      const { token: adminToken } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin",
        "admin@escalation.com"
      );
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@escalation.com"
      );

      // Attempt to promote Dev to ADMIN
      const resAdmin = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: ROLES.ADMIN });

      expect(resAdmin.status).toBe(403);
      expect(resAdmin.body.error.code).toBe("FORBIDDEN");

      // Attempt to promote Dev to SUPER_ADMIN
      const resSuperAdmin = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/role`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ role: ROLES.SUPER_ADMIN });

      expect(resSuperAdmin.status).toBe(403);
      expect(resSuperAdmin.body.error.code).toBe("FORBIDDEN");
    });

    it("should prevent ADMIN from modifying another ADMIN or SUPER_ADMIN", async () => {
      const { org, user: superAdmin } = await setupOrgWithUser("Target Org", "target-org", ROLES.SUPER_ADMIN);
      const { token: admin1Token } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin 1",
        "admin1@target.com"
      );
      const { user: admin2 } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin 2",
        "admin2@target.com"
      );

      // Admin 1 attempts to demote Admin 2
      const resAdminOnAdmin = await request(app)
        .patch(`/api/v1/organizations/me/members/${admin2._id.toString()}/role`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ role: ROLES.DEVELOPER });

      expect(resAdminOnAdmin.status).toBe(403);
      expect(resAdminOnAdmin.body.error.code).toBe("FORBIDDEN");

      // Admin 1 attempts to demote Super Admin
      const resAdminOnSuper = await request(app)
        .patch(`/api/v1/organizations/me/members/${superAdmin._id.toString()}/role`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ role: ROLES.DEVELOPER });

      expect(resAdminOnSuper.status).toBe(403);
      expect(resAdminOnSuper.body.error.code).toBe("FORBIDDEN");
    });

    it("should reject DEVELOPER and MANAGER from modifying any roles (403)", async () => {
      const { org } = await setupOrgWithUser("Unauthorized Role Org", "unauth-role-org", ROLES.SUPER_ADMIN);
      const { token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@unauth.com"
      );
      const { user: targetDev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Target Dev",
        "targetdev@unauth.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${targetDev._id.toString()}/role`)
        .set("Authorization", `Bearer ${devToken}`)
        .send({ role: ROLES.MANAGER });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 8. Preventing Removal / Deactivation of the Only Super Admin
  // ==========================================
  describe("Super Admin Protection", () => {
    it("should prevent demoting the organization's only Super Admin (409 Conflict)", async () => {
      const { org, user: superAdmin1, token: superAdmin1Token } = await setupOrgWithUser(
        "Only Super Org",
        "only-super-org",
        ROLES.SUPER_ADMIN
      );

      // Add a second Super Admin so we can demote one
      const { user: superAdmin2 } = await createMember(
        org._id.toString(),
        ROLES.SUPER_ADMIN,
        "Super Admin 2",
        "super2@only-super.com",
        true
      );

      // Demoting superAdmin2 by superAdmin1 succeeds because there are 2 active Super Admins
      const resDemoteFirst = await request(app)
        .patch(`/api/v1/organizations/me/members/${superAdmin2._id.toString()}/role`)
        .set("Authorization", `Bearer ${superAdmin1Token}`)
        .send({ role: ROLES.ADMIN });

      expect(resDemoteFirst.status).toBe(200);
      expect(resDemoteFirst.body.data.role).toBe(ROLES.ADMIN);

      // Now superAdmin1 is the ONLY active Super Admin.
      // Attempting to demote superAdmin1 must be rejected with ConflictError (409)
      const { organizationService } = await import("../src/services/organizationService");
      await expect(
        organizationService.updateMemberRole(
          org._id.toString(),
          "actor-id-different-from-target",
          ROLES.SUPER_ADMIN,
          superAdmin1._id.toString(),
          ROLES.ADMIN
        )
      ).rejects.toThrow("Cannot demote the organization's only active Super Admin");
    });

    it("should prevent deactivating the organization's only Super Admin (409 Conflict)", async () => {
      const { org } = await setupOrgWithUser("Deact Super Org", "deact-super-org", ROLES.SUPER_ADMIN);
      const superAdmin1 = await userDao.findByEmail("super_admin@deact-super-org.com");

      // Create a second active Super Admin so one can attempt to deactivate the other
      const { token: superAdmin2Token, user: superAdmin2 } = await createMember(
        org._id.toString(),
        ROLES.SUPER_ADMIN,
        "Super Admin 2",
        "super2@deact.com",
        true
      );

      // Deactivate superAdmin1 by superAdmin2 (since there are 2, this succeeds):
      const res1 = await request(app)
        .patch(`/api/v1/organizations/me/members/${superAdmin1!._id.toString()}/status`)
        .set("Authorization", `Bearer ${superAdmin2Token}`)
        .send({ isActive: false });

      expect(res1.status).toBe(200);
      expect(res1.body.data.isActive).toBe(false);

      // Now superAdmin2 is the ONLY active Super Admin in the organization!
      // Reactivate superAdmin1 as a DEVELOPER:
      await userDao.updateById(superAdmin1!._id, { role: ROLES.DEVELOPER, isActive: true });

      // Create another caller to attempt deactivating superAdmin2:
      const { token: callerToken } = await createMember(
        org._id.toString(),
        ROLES.SUPER_ADMIN,
        "Caller Admin",
        "caller@deact.com",
        false // inactive super admin!
      );
      // Wait, an inactive caller cannot authenticate.
      // So promote superAdmin1 to SUPER_ADMIN, attempt to deactivate superAdmin2:
      // Let's create an active Super Admin caller3:
      const { token: caller3Token } = await createMember(
        org._id.toString(),
        ROLES.SUPER_ADMIN,
        "Caller 3",
        "caller3@deact.com",
        true
      );
      // Now active super admins = 2 (superAdmin2 and Caller 3).
      // Demote superAdmin2:
      await request(app)
        .patch(`/api/v1/organizations/me/members/${superAdmin2._id.toString()}/role`)
        .set("Authorization", `Bearer ${caller3Token}`)
        .send({ role: ROLES.DEVELOPER });

      // Now Caller 3 is the ONLY active Super Admin.
      // If another Super Admin existed who was deactivated, active count is still 1.
      // Promote superAdmin2 back to Super Admin, then try to demote Caller 3 when active count is 1:
      // We test demoting Caller 3 when Caller 3 is the only Super Admin:
      const { organizationService } = await import("../src/services/organizationService");
      await expect(
        organizationService.updateMemberRole(
          org._id.toString(),
          "differentUserId1234567890",
          ROLES.SUPER_ADMIN,
          superAdmin1!._id.toString(), // has role DEVELOPER
          ROLES.ADMIN
        )
      ).resolves.toBeDefined();

      // Directly verify that trying to demote the sole active Super Admin throws ConflictError:
      await expect(
        organizationService.updateMemberRole(
          org._id.toString(),
          "differentUserId1234567890",
          ROLES.SUPER_ADMIN,
          (await userDao.findByEmail("caller3@deact.com"))!._id.toString(),
          ROLES.DEVELOPER
        )
      ).rejects.toThrow("Cannot demote the organization's only active Super Admin");

      // Directly verify that trying to deactivate the sole active Super Admin throws ConflictError:
      await expect(
        organizationService.updateMemberStatus(
          org._id.toString(),
          "differentUserId1234567890",
          ROLES.SUPER_ADMIN,
          (await userDao.findByEmail("caller3@deact.com"))!._id.toString(),
          false
        )
      ).rejects.toThrow("Cannot deactivate the organization's only active Super Admin");
    });
  });

  // ==========================================
  // 9. Status Management (Activate / Deactivate)
  // ==========================================
  describe("PATCH /api/v1/organizations/me/members/:memberId/status", () => {
    it("should allow SUPER_ADMIN to deactivate and reactivate a member", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser("Status Org", "status-org", ROLES.SUPER_ADMIN);
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev Guy",
        "devguy@status.com"
      );

      // Deactivate
      const resDeact = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/status`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ isActive: false });

      expect(resDeact.status).toBe(200);
      expect(resDeact.body.data.isActive).toBe(false);

      // Reactivate
      const resReact = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/status`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ isActive: true });

      expect(resReact.status).toBe(200);
      expect(resReact.body.data.isActive).toBe(true);
    });

    it("should allow ADMIN to deactivate and reactivate a Developer or Manager", async () => {
      const { org } = await setupOrgWithUser("Admin Status Org", "admin-status-org", ROLES.SUPER_ADMIN);
      const { token: adminToken } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin",
        "admin@adminstatus.com"
      );
      const { user: dev } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Dev",
        "dev@adminstatus.com"
      );

      const res = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/status`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);
    });

    it("should prevent ADMIN from deactivating another ADMIN or SUPER_ADMIN (403)", async () => {
      const { org, user: superAdmin } = await setupOrgWithUser("Admin Guard Org", "admin-guard-org", ROLES.SUPER_ADMIN);
      const { token: admin1Token } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin 1",
        "admin1@guard.com"
      );
      const { user: admin2 } = await createMember(
        org._id.toString(),
        ROLES.ADMIN,
        "Admin 2",
        "admin2@guard.com"
      );

      // Admin 1 attempts to deactivate Admin 2
      const resOnAdmin = await request(app)
        .patch(`/api/v1/organizations/me/members/${admin2._id.toString()}/status`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ isActive: false });

      expect(resOnAdmin.status).toBe(403);
      expect(resOnAdmin.body.error.code).toBe("FORBIDDEN");

      // Admin 1 attempts to deactivate Super Admin
      const resOnSuper = await request(app)
        .patch(`/api/v1/organizations/me/members/${superAdmin._id.toString()}/status`)
        .set("Authorization", `Bearer ${admin1Token}`)
        .send({ isActive: false });

      expect(resOnSuper.status).toBe(403);
      expect(resOnSuper.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ==========================================
  // 10. Access Denial for Deactivated Users
  // ==========================================
  describe("Immediate Access Denial for Deactivated Accounts", () => {
    it("should immediately deny access with 401 when account is deactivated, even with valid unexpired JWT", async () => {
      const { org, token: superAdminToken } = await setupOrgWithUser("Auth Guard Org", "auth-guard-org", ROLES.SUPER_ADMIN);

      // Create a developer and obtain their valid JWT
      const { user: dev, token: devToken } = await createMember(
        org._id.toString(),
        ROLES.DEVELOPER,
        "Active Dev",
        "activedev@guard.com"
      );

      // Developer successfully accesses /me with their token
      const resBefore = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${devToken}`);

      expect(resBefore.status).toBe(200);

      // Super Admin deactivates the developer
      const resDeact = await request(app)
        .patch(`/api/v1/organizations/me/members/${dev._id.toString()}/status`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ isActive: false });

      expect(resDeact.status).toBe(200);

      // Developer immediately tries to access protected endpoint with the SAME unexpired token
      const resAfter = await request(app)
        .get("/api/v1/organizations/me")
        .set("Authorization", `Bearer ${devToken}`);

      expect(resAfter.status).toBe(401);
      expect(resAfter.body.success).toBe(false);
      expect(resAfter.body.error.code).toBe("AUTHENTICATION_ERROR");
      expect(resAfter.body.error.message).toContain("deactivated");
    });
  });
});
