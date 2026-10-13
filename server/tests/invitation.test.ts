import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { invitationDao } from "../src/dao/invitationDao";
import { ROLES, INVITATION_STATUS } from "../src/types";
import { generateAccessToken, hashToken } from "../src/utils/tokenUtils";

describe("Invitation & Member Onboarding API (/api/v1/invitations)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  // Helper to bootstrap an organization with a Super Admin user and return tokens
  const setupOrgAndSuperAdmin = async (orgName = "Acme Corp", slug = "acme-corp") => {
    const org = await organizationDao.create({ name: orgName, slug });
    const superAdmin = await userDao.create({
      name: "Owner",
      email: `owner@${slug}.com`,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role: ROLES.SUPER_ADMIN,
      organizationId: org._id,
      isActive: true,
    });

    const token = generateAccessToken({
      userId: superAdmin._id.toString(),
      organizationId: org._id.toString(),
      role: ROLES.SUPER_ADMIN,
      email: superAdmin.email,
    });

    return { org, superAdmin, token };
  };

  // Helper to create a user with a specific role in an organization and return their access token
  const createUserWithRole = async (orgId: string, role: (typeof ROLES)[keyof typeof ROLES], email: string) => {
    const user = await userDao.create({
      name: `User ${role}`,
      email,
      passwordHash: "$2a$12$dummyhashforpasswordtesting123456",
      role,
      organizationId: orgId,
      isActive: true,
    });

    const token = generateAccessToken({
      userId: user._id.toString(),
      organizationId: orgId,
      role,
      email: user.email,
    });

    return { user, token };
  };

  describe("POST /api/v1/invitations (Create Invitation)", () => {
    it("1. Super Admin successfully invites an Admin", async () => {
      const { org, token } = await setupOrgAndSuperAdmin();

      const res = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "newadmin@acme-corp.com",
          role: ROLES.ADMIN,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe("newadmin@acme-corp.com");
      expect(res.body.data.role).toBe(ROLES.ADMIN);
      expect(res.body.data.status).toBe(INVITATION_STATUS.PENDING);
      expect(res.body.data.organizationId).toBe(org._id.toString());
      expect(res.body.data.invitationToken).toBeDefined();
      expect(res.body.data.invitationLink).toContain(res.body.data.invitationToken);
    });

    it("2. Super Admin successfully invites a Manager and Developer", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      const resManager = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "manager@acme-corp.com",
          role: ROLES.MANAGER,
        });

      expect(resManager.status).toBe(201);
      expect(resManager.body.data.role).toBe(ROLES.MANAGER);

      const resDev = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "developer@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      expect(resDev.status).toBe(201);
      expect(resDev.body.data.role).toBe(ROLES.DEVELOPER);
    });

    it("3. Admin cannot invite another Admin or Super Admin", async () => {
      const { org } = await setupOrgAndSuperAdmin();
      const { token: adminToken } = await createUserWithRole(
        org._id.toString(),
        ROLES.ADMIN,
        "admin@acme-corp.com"
      );

      // Attempt to invite another ADMIN (Admin is only allowed to invite MANAGER, DEVELOPER)
      const resInviteAdmin = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "anotheradmin@acme-corp.com",
          role: ROLES.ADMIN,
        });

      expect(resInviteAdmin.status).toBe(403);
      expect(resInviteAdmin.body.success).toBe(false);
      expect(resInviteAdmin.body.error.code).toBe("FORBIDDEN");
      expect(resInviteAdmin.body.error.message).toContain("not permitted");

      // Attempt to invite a SUPER_ADMIN (Forbidden role for invitations)
      const resInviteSuperAdmin = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          email: "superadmin@acme-corp.com",
          role: ROLES.SUPER_ADMIN,
        });

      expect(resInviteSuperAdmin.status).toBe(400); // Rejected by schema validation
      expect(resInviteSuperAdmin.body.success).toBe(false);
      expect(resInviteSuperAdmin.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("4. Manager and Developer cannot create invitations", async () => {
      const { org } = await setupOrgAndSuperAdmin();
      const { token: managerToken } = await createUserWithRole(
        org._id.toString(),
        ROLES.MANAGER,
        "manager@acme-corp.com"
      );
      const { token: devToken } = await createUserWithRole(
        org._id.toString(),
        ROLES.DEVELOPER,
        "dev@acme-corp.com"
      );

      // Manager attempt
      const resManager = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${managerToken}`)
        .send({
          email: "guest@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      expect(resManager.status).toBe(403);
      expect(resManager.body.error.code).toBe("FORBIDDEN");

      // Developer attempt
      const resDev = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${devToken}`)
        .send({
          email: "guest2@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      expect(resDev.status).toBe(403);
      expect(resDev.body.error.code).toBe("FORBIDDEN");
    });

    it("5. Unauthenticated users cannot manage invitations", async () => {
      // POST without auth
      const postRes = await request(app)
        .post("/api/v1/invitations")
        .send({ email: "user@example.com", role: ROLES.DEVELOPER });

      expect(postRes.status).toBe(401);
      expect(postRes.body.error.code).toBe("AUTHENTICATION_ERROR");

      // GET without auth
      const getRes = await request(app).get("/api/v1/invitations");
      expect(getRes.status).toBe(401);
      expect(getRes.body.error.code).toBe("AUTHENTICATION_ERROR");

      // DELETE without auth
      const deleteRes = await request(app).delete("/api/v1/invitations/64f123456789abcdef012345");
      expect(deleteRes.status).toBe(401);
      expect(deleteRes.body.error.code).toBe("AUTHENTICATION_ERROR");
    });

    it("6. Duplicate registered emails are handled safely", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      // Create an existing registered user
      await userDao.create({
        name: "Existing Person",
        email: "existing@example.com",
        passwordHash: "hash123",
        role: ROLES.DEVELOPER,
        organizationId: "64f123456789abcdef012345",
      });

      const res = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "existing@example.com",
          role: ROLES.DEVELOPER,
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).toContain("email address already exists");
    });

    it("7. Conflicting pending invitations are handled correctly", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      // Send first invitation
      const firstRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "candidate@example.com",
          role: ROLES.DEVELOPER,
        });

      expect(firstRes.status).toBe(201);

      // Attempt second pending invitation for the same email
      const secondRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "candidate@example.com",
          role: ROLES.MANAGER,
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe("CONFLICT");
      expect(secondRes.body.error.message).toContain("pending invitation already exists");
    });
  });

  describe("POST /api/v1/invitations/accept (Accept Invitation)", () => {
    it("8. Valid invitation acceptance creates the correct user", async () => {
      const { org, token } = await setupOrgAndSuperAdmin();

      // 1. Create invitation
      const inviteRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "onboard@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      const rawToken = inviteRes.body.data.invitationToken;
      expect(rawToken).toBeDefined();

      // 2. Accept invitation
      const acceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: rawToken,
          name: "Onboarded Developer",
          password: "SecurePassword123!",
        });

      expect(acceptRes.status).toBe(201);
      expect(acceptRes.body.success).toBe(true);
      expect(acceptRes.body.data.user.email).toBe("onboard@acme-corp.com");
      expect(acceptRes.body.data.user.name).toBe("Onboarded Developer");
      expect(acceptRes.body.data.user.role).toBe(ROLES.DEVELOPER);
      expect(acceptRes.body.data.organization.id).toBe(org._id.toString());

      // Verify user exists in database and password is properly hashed
      const dbUser = await userDao.findByEmail("onboard@acme-corp.com", true);
      expect(dbUser).not.toBeNull();
      expect(dbUser?.passwordHash).not.toBe("SecurePassword123!");
      expect(dbUser?.passwordHash.startsWith("$2")).toBe(true);

      // Verify invitation in DB is updated to ACCEPTED
      const dbInvitation = await invitationDao.findByTokenHash(hashToken(rawToken));
      expect(dbInvitation?.status).toBe(INVITATION_STATUS.ACCEPTED);
      expect(dbInvitation?.acceptedAt).toBeDefined();
    });

    it("9. The invited user's organization and role come from the invitation, not the request", async () => {
      const { org, token } = await setupOrgAndSuperAdmin();

      const inviteRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "target@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      const rawToken = inviteRes.body.data.invitationToken;

      // Malicious payload attempting privilege escalation and cross-tenant hijacking
      const acceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: rawToken,
          name: "Privilege Escalation Attempt",
          password: "Password123!",
          role: ROLES.SUPER_ADMIN, // Attempting to force SUPER_ADMIN
          organizationId: "64f123456789abcdef012345", // Attempting to switch org
        });

      expect(acceptRes.status).toBe(201);
      expect(acceptRes.body.data.user.role).toBe(ROLES.DEVELOPER); // Must remain DEVELOPER
      expect(acceptRes.body.data.organization.id).toBe(org._id.toString()); // Must remain Acme Corp
    });

    it("10. Invalid, expired, revoked, and already accepted invitations are rejected", async () => {
      const { org, token, superAdmin } = await setupOrgAndSuperAdmin();

      // A: Invalid token
      const invalidRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: "completely_fake_invalid_token_12345",
          name: "Tester",
          password: "Password123!",
        });

      expect(invalidRes.status).toBe(404);
      expect(invalidRes.body.error.code).toBe("NOT_FOUND");

      // B: Expired invitation
      const expiredRawToken = "expired_raw_token_xyz_12345";
      await invitationDao.create({
        organizationId: org._id,
        email: "expired@acme-corp.com",
        role: ROLES.DEVELOPER,
        inviterId: superAdmin._id,
        tokenHash: hashToken(expiredRawToken),
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      });

      const expiredRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: expiredRawToken,
          name: "Tester",
          password: "Password123!",
        });

      expect(expiredRes.status).toBe(409);
      expect(expiredRes.body.error.code).toBe("CONFLICT");
      expect(expiredRes.body.error.message).toContain("expired");

      // C: Revoked invitation
      const revokedInviteRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "revoked@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      const revokedToken = revokedInviteRes.body.data.invitationToken;
      const invitationId = revokedInviteRes.body.data.id;

      // Revoke it
      await request(app)
        .delete(`/api/v1/invitations/${invitationId}`)
        .set("Authorization", `Bearer ${token}`);

      // Try to accept revoked
      const revokedAcceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: revokedToken,
          name: "Tester",
          password: "Password123!",
        });

      expect(revokedAcceptRes.status).toBe(409);
      expect(revokedAcceptRes.body.error.code).toBe("CONFLICT");
      expect(revokedAcceptRes.body.error.message).toContain("revoked");

      // D: Already accepted invitation
      const acceptedInviteRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "onceonly@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      const onceToken = acceptedInviteRes.body.data.invitationToken;

      // Accept first time
      await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: onceToken,
          name: "First Accept",
          password: "Password123!",
        });

      // Accept second time
      const secondAcceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: onceToken,
          name: "Second Accept",
          password: "Password123!",
        });

      expect(secondAcceptRes.status).toBe(409);
      expect(secondAcceptRes.body.error.code).toBe("CONFLICT");
      expect(secondAcceptRes.body.error.message).toContain("already been accepted");
    });

    it("11. Concurrent acceptance cannot create duplicate users or consume an invitation more than once", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      const inviteRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "racecondition@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      const rawToken = inviteRes.body.data.invitationToken;

      // Launch 5 concurrent acceptance requests
      const promises = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post("/api/v1/invitations/accept")
          .send({
            token: rawToken,
            name: `Concurrent User ${i}`,
            password: "Password123!",
          })
      );

      const results = await Promise.all(promises);

      // Exactly ONE request must succeed (201)
      const successful = results.filter((r) => r.status === 201);
      const rejected = results.filter((r) => r.status === 409);

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(4);

      // Verify in DB that only one user exists
      const users = await userDao.findByEmail("racecondition@acme-corp.com");
      expect(users).not.toBeNull();
    });
  });

  describe("GET /api/v1/invitations & DELETE /api/v1/invitations/:invitationId (Cross-Org Isolation)", () => {
    it("12. Users cannot list or revoke invitations belonging to another organization", async () => {
      // Setup Org A
      const { token: tokenOrgA } = await setupOrgAndSuperAdmin("Org Alpha", "org-alpha");
      // Setup Org B
      const { token: tokenOrgB } = await setupOrgAndSuperAdmin("Org Beta", "org-beta");

      // Org A creates an invitation
      const inviteOrgARes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${tokenOrgA}`)
        .send({
          email: "member@org-alpha.com",
          role: ROLES.DEVELOPER,
        });

      const orgAInvitationId = inviteOrgARes.body.data.id;

      // Org B lists invitations -> must NOT see Org A's invitation
      const listOrgBRes = await request(app)
        .get("/api/v1/invitations")
        .set("Authorization", `Bearer ${tokenOrgB}`);

      expect(listOrgBRes.status).toBe(200);
      expect(listOrgBRes.body.data).toHaveLength(0);

      // Org B attempts to revoke Org A's invitation -> must be forbidden
      const crossOrgRevokeRes = await request(app)
        .delete(`/api/v1/invitations/${orgAInvitationId}`)
        .set("Authorization", `Bearer ${tokenOrgB}`);

      expect(crossOrgRevokeRes.status).toBe(403);
      expect(crossOrgRevokeRes.body.success).toBe(false);
      expect(crossOrgRevokeRes.body.error.code).toBe("FORBIDDEN");
      expect(crossOrgRevokeRes.body.error.message).toContain("another organization");

      // Org A can successfully revoke their own invitation
      const validRevokeRes = await request(app)
        .delete(`/api/v1/invitations/${orgAInvitationId}`)
        .set("Authorization", `Bearer ${tokenOrgA}`);

      expect(validRevokeRes.status).toBe(200);
      expect(validRevokeRes.body.data.status).toBe(INVITATION_STATUS.REVOKED);
    });

    it("13. Responses do not expose password hashes or token hashes", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      // Create invitation
      const createRes = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "secrettest@acme-corp.com",
          role: ROLES.DEVELOPER,
        });

      expect(createRes.body.data.tokenHash).toBeUndefined();
      expect(JSON.stringify(createRes.body)).not.toContain("tokenHash");

      // List invitations
      const listRes = await request(app)
        .get("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`);

      expect(listRes.body.data[0].tokenHash).toBeUndefined();
      expect(JSON.stringify(listRes.body)).not.toContain("tokenHash");

      // Accept invitation
      const acceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: createRes.body.data.invitationToken,
          name: "Secret Tester",
          password: "SecurePassword123!",
        });

      expect(acceptRes.body.data.user.passwordHash).toBeUndefined();
      expect(acceptRes.body.data.user.password).toBeUndefined();
      expect(JSON.stringify(acceptRes.body)).not.toContain("passwordHash");
    });

    it("14. Validation errors use the existing response format", async () => {
      const { token } = await setupOrgAndSuperAdmin();

      // Malformed email and invalid role
      const res = await request(app)
        .post("/api/v1/invitations")
        .set("Authorization", `Bearer ${token}`)
        .send({
          email: "not-an-email-at-all",
          role: "CHIEF_EXECUTIVE_OFFICER",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.error.details)).toBe(true);

      const fieldNames = res.body.error.details.map((d: { field: string }) => d.field);
      expect(fieldNames).toContain("email");
      expect(fieldNames).toContain("role");

      // Malformed acceptance payload
      const acceptRes = await request(app)
        .post("/api/v1/invitations/accept")
        .send({
          token: "",
          name: "A", // too short (min 2)
          password: "short", // too short (min 8)
        });

      expect(acceptRes.status).toBe(400);
      expect(acceptRes.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(acceptRes.body.error.details)).toBe(true);
    });
  });
});
