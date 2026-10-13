import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { organizationDao } from "../src/dao/organizationDao";
import { userDao } from "../src/dao/userDao";
import { invitationDao } from "../src/dao/invitationDao";
import { refreshTokenDao } from "../src/dao/refreshTokenDao";
import { ROLES, INVITATION_STATUS } from "../src/types";

describe("DAO Layer Integration Tests", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 60000); // 60s timeout for first-time binary download if needed

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe("OrganizationDao", () => {
    it("should create an organization and retrieve by slug", async () => {
      const org = await organizationDao.create({
        name: "Acme Corporation",
        slug: "acme-corp",
      });

      expect(org._id).toBeDefined();
      expect(org.name).toBe("Acme Corporation");
      expect(org.slug).toBe("acme-corp");
      expect(org.statusPageEnabled).toBe(false);

      const found = await organizationDao.findBySlug("acme-corp");
      expect(found).not.toBeNull();
      expect(found?._id.toString()).toBe(org._id.toString());

      const exists = await organizationDao.existsBySlug("acme-corp");
      expect(exists).toBe(true);

      const notExists = await organizationDao.existsBySlug("unknown-slug");
      expect(notExists).toBe(false);
    });

    it("should delete an organization by id", async () => {
      const org = await organizationDao.create({
        name: "Test Org",
        slug: "test-org",
      });

      const deleted = await organizationDao.deleteById(org._id);
      expect(deleted).toBe(true);

      const found = await organizationDao.findById(org._id);
      expect(found).toBeNull();
    });
  });

  describe("UserDao", () => {
    it("should create user with normalized email and exclude password by default", async () => {
      const org = await organizationDao.create({ name: "Org 1", slug: "org-1" });

      const user = await userDao.create({
        name: "Alice Doe",
        email: "Alice.Doe@Example.COM",
        passwordHash: "$2a$12$hashedPasswordExample",
        role: ROLES.SUPER_ADMIN,
        organizationId: org._id,
      });

      expect(user._id).toBeDefined();
      expect(user.email).toBe("alice.doe@example.com"); // normalized
      expect(user.role).toBe(ROLES.SUPER_ADMIN);
      expect(user.isActive).toBe(true);

      // Default find excludes passwordHash
      const found = await userDao.findByEmail("alice.doe@example.com");
      expect(found?.passwordHash).toBeUndefined();

      // Explicit select includes passwordHash
      const foundWithPw = await userDao.findByEmail("alice.doe@example.com", true);
      expect(foundWithPw?.passwordHash).toBe("$2a$12$hashedPasswordExample");
    });

    it("should list members scoped to organization", async () => {
      const org1 = await organizationDao.create({ name: "Org 1", slug: "org-1" });
      const org2 = await organizationDao.create({ name: "Org 2", slug: "org-2" });

      await userDao.create({
        name: "User 1",
        email: "user1@org1.com",
        passwordHash: "hash",
        role: ROLES.ADMIN,
        organizationId: org1._id,
      });

      await userDao.create({
        name: "User 2",
        email: "user2@org2.com",
        passwordHash: "hash",
        role: ROLES.DEVELOPER,
        organizationId: org2._id,
      });

      const org1Members = await userDao.findMembersByOrg(org1._id);
      expect(org1Members).toHaveLength(1);
      expect(org1Members[0].name).toBe("User 1");

      const org2Count = await userDao.countMembersByOrg(org2._id);
      expect(org2Count).toBe(1);
    });
  });

  describe("InvitationDao", () => {
    it("should create invitation and atomically accept it", async () => {
      const org = await organizationDao.create({ name: "Org 1", slug: "org-1" });
      const inviter = await userDao.create({
        name: "Admin",
        email: "admin@org1.com",
        passwordHash: "hash",
        role: ROLES.SUPER_ADMIN,
        organizationId: org._id,
      });

      const invitation = await invitationDao.create({
        organizationId: org._id,
        email: "newmember@example.com",
        role: ROLES.DEVELOPER,
        inviterId: inviter._id,
        tokenHash: "sha256_dummy_hash_value_12345",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });

      expect(invitation.status).toBe(INVITATION_STATUS.PENDING);

      const accepted = await invitationDao.acceptInvitation(invitation._id);
      expect(accepted).not.toBeNull();
      expect(accepted?.status).toBe(INVITATION_STATUS.ACCEPTED);
      expect(accepted?.acceptedAt).toBeDefined();

      // Second attempt to accept should return null (single-use guarantee)
      const secondAttempt = await invitationDao.acceptInvitation(invitation._id);
      expect(secondAttempt).toBeNull();
    });
  });

  describe("RefreshTokenDao", () => {
    it("should create refresh token and revoke family on breach detection", async () => {
      const org = await organizationDao.create({ name: "Org 1", slug: "org-1" });
      const user = await userDao.create({
        name: "User",
        email: "user@org1.com",
        passwordHash: "hash",
        role: ROLES.DEVELOPER,
        organizationId: org._id,
      });

      const familyId = "family-uuid-123";

      const token1 = await refreshTokenDao.create({
        userId: user._id,
        organizationId: org._id,
        tokenHash: "token_hash_1",
        family: familyId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const token2 = await refreshTokenDao.create({
        userId: user._id,
        organizationId: org._id,
        tokenHash: "token_hash_2",
        family: familyId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(token1.isRevoked).toBe(false);
      expect(token2.isRevoked).toBe(false);

      // Revoke whole family
      const revokedCount = await refreshTokenDao.revokeFamily(familyId);
      expect(revokedCount).toBe(2);

      const found1 = await refreshTokenDao.findByTokenHash("token_hash_1");
      expect(found1?.isRevoked).toBe(true);
    });
  });
});
