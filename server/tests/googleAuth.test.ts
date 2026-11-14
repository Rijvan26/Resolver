import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { OAuth2Client } from "google-auth-library";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { invitationDao } from "../src/dao/invitationDao";
import { ROLES, INVITATION_STATUS } from "../src/types";
import { hashToken } from "../src/utils/tokenUtils";

describe("Google OAuth API (POST /api/v1/auth/google)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    vi.restoreAllMocks();
  });

  it("should reject request when idToken is missing", async () => {
    const res = await request(app).post("/api/v1/auth/google").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("should reject request when Google token verification fails", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockRejectedValueOnce(
      new Error("Invalid token signature")
    );

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "invalid-token-12345" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.message).toContain("Google authentication failed");
  });

  it("should return requiresWorkspaceSetup for first-time Google sign-in without org details", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-uid-1001",
        email: "alice@example.com",
        name: "Alice Adams",
        picture: "https://lh3.googleusercontent.com/a/alice.jpg",
      }),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "valid-google-jwt-token" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requiresWorkspaceSetup).toBe(true);
    expect(res.body.data.setupToken).toBeDefined();
    expect(res.body.data.suggestedOrgName).toBe("Alice Adams's Team");
    expect(res.body.data.suggestedSlug).toBe("alice-adams");
    expect(res.body.data.user.email).toBe("alice@example.com");

    // Complete workspace setup with custom name and custom slug
    const completeRes = await request(app)
      .post("/api/v1/auth/google/complete-setup")
      .send({
        setupToken: res.body.data.setupToken,
        organizationName: "Acme Cloud Services",
        slug: "acme-cloud",
      });

    expect(completeRes.status).toBe(201);
    expect(completeRes.body.success).toBe(true);
    expect(completeRes.body.data.organization.name).toBe("Acme Cloud Services");
    expect(completeRes.body.data.organization.slug).toBe("acme-cloud");
    expect(completeRes.body.data.user.role).toBe(ROLES.SUPER_ADMIN);

    // Verify DB user
    const dbUser = await userDao.findByEmail("alice@example.com");
    expect(dbUser).not.toBeNull();
    expect(dbUser?.authProvider).toBe("google");
    expect(dbUser?.googleId).toBe("google-uid-1001");
  });

  it("should directly register new user when organizationName and slug are provided upfront", async () => {
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-uid-2002",
        email: "charlie@example.com",
        name: "Charlie Brown",
      }),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({
        idToken: "charlie-token",
        organizationName: "Charlie Tech",
        slug: "charlie-tech",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.organization.name).toBe("Charlie Tech");
    expect(res.body.data.organization.slug).toBe("charlie-tech");
    expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);
  });

  it("should authenticate existing user and link googleId seamlessly", async () => {
    // 1. Create an existing org and user
    const org = await organizationDao.create({
      name: "Existing Tech Corp",
      slug: "existing-tech-corp",
      statusPageEnabled: false,
    });

    const user = await userDao.create({
      name: "Bob Builder",
      email: "bob@existingtech.com",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      role: ROLES.ADMIN,
      organizationId: org._id,
      authProvider: "local",
      isActive: true,
    });

    // 2. Bob signs in with Google having matching email
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-uid-bob-999",
        email: "bob@existingtech.com",
        name: "Bob Builder",
        picture: "https://lh3.googleusercontent.com/a/bob.jpg",
      }),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "bob-google-jwt" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("bob@existingtech.com");
    expect(res.body.data.user.role).toBe(ROLES.ADMIN);
    expect(res.body.data.organization.name).toBe("Existing Tech Corp");

    // Verify googleId was linked
    const updatedUser = await userDao.findById(user._id);
    expect(updatedUser?.googleId).toBe("google-uid-bob-999");
  });

  it("should accept invitation and join existing organization via Google sign-in", async () => {
    const org = await organizationDao.create({
      name: "Invite Org",
      slug: "invite-org",
      statusPageEnabled: false,
    });

    const inviter = await userDao.create({
      name: "Inviter Admin",
      email: "admin@inviteorg.com",
      passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
      role: ROLES.SUPER_ADMIN,
      organizationId: org._id,
    });

    const rawToken = "invitation-secret-token-1234567890";
    await invitationDao.create({
      organizationId: org._id,
      email: "newmember@inviteorg.com",
      role: ROLES.DEVELOPER,
      inviterId: inviter._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: INVITATION_STATUS.PENDING,
    });

    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-uid-newmember",
        email: "newmember@inviteorg.com",
        name: "New Member",
      }),
    } as any);

    const res = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "valid-invitee-token", invitationToken: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("newmember@inviteorg.com");
    expect(res.body.data.user.role).toBe(ROLES.DEVELOPER);
    expect(res.body.data.organization.id).toBe(org._id.toString());

    // Verify invitation is now marked accepted
    const inviteInDb = await invitationDao.findByTokenHash(hashToken(rawToken));
    expect(inviteInDb?.status).toBe(INVITATION_STATUS.ACCEPTED);
  });
});
