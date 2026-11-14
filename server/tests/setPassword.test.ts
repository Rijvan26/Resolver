import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import { OAuth2Client } from "google-auth-library";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES } from "../src/types";

describe("Set and Change Password API (POST /api/v1/auth/set-password)", () => {
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

  it("should reject unauthenticated request to /api/v1/auth/set-password", async () => {
    const res = await request(app)
      .post("/api/v1/auth/set-password")
      .send({ newPassword: "NewSecretPassword123!" });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it("should allow a Google OAuth user without a password to set a new password", async () => {
    // 1. Create organization and user via Google OAuth
    const org = await organizationDao.create({
      name: "Google Team Org",
      slug: "google-team-org",
      statusPageEnabled: false,
    });

    const googleUser = await userDao.create({
      name: "Google User",
      email: "googleuser@example.com",
      role: ROLES.SUPER_ADMIN,
      organizationId: org._id,
      authProvider: "google",
      googleId: "google-uid-777",
      isActive: true,
    });

    // Mock Google sign-in to get access token
    vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValueOnce({
      getPayload: () => ({
        sub: "google-uid-777",
        email: "googleuser@example.com",
        name: "Google User",
      }),
    } as any);

    const loginRes = await request(app)
      .post("/api/v1/auth/google")
      .send({ idToken: "dummy-google-token" });

    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;
    expect(loginRes.body.data.user.hasPassword).toBe(false);

    // 2. Try logging in via standard /login before setting password - should be rejected
    const failedLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "googleuser@example.com", password: "SomePassword123!" });

    expect(failedLoginRes.status).toBe(401);
    expect(failedLoginRes.body.error.message).toContain("Google Sign-In");

    // 3. User sets password without currentPassword
    const setPassRes = await request(app)
      .post("/api/v1/auth/set-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ newPassword: "MyNewStrongPassword123!" });

    expect(setPassRes.status).toBe(200);
    expect(setPassRes.body.success).toBe(true);
    expect(setPassRes.body.data.hasPassword).toBe(true);
    expect(setPassRes.body.message).toContain("Password created successfully");

    // 4. Verify /auth/me now returns hasPassword: true
    const meRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.hasPassword).toBe(true);

    // 5. User can now successfully log in with email and new password!
    const standardLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "googleuser@example.com", password: "MyNewStrongPassword123!" });

    expect(standardLoginRes.status).toBe(200);
    expect(standardLoginRes.body.success).toBe(true);
    expect(standardLoginRes.body.data.user.email).toBe("googleuser@example.com");
    expect(standardLoginRes.body.data.user.hasPassword).toBe(true);
  });

  it("should enforce current password verification once a password has been set", async () => {
    // 1. Register organization with email and password
    const regRes = await request(app)
      .post("/api/v1/auth/register-organization")
      .send({
        organizationName: "Password Test Org",
        creatorName: "Pass User",
        email: "passuser@example.com",
        password: "InitialPassword123!",
      });

    expect(regRes.status).toBe(201);

    // 2. Log in
    const loginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "passuser@example.com", password: "InitialPassword123!" });

    expect(loginRes.status).toBe(200);
    const accessToken = loginRes.body.data.accessToken;

    // 3. Attempt to set password without currentPassword -> should fail with 400
    const missingCurrentRes = await request(app)
      .post("/api/v1/auth/set-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ newPassword: "BrandNewPassword456!" });

    expect(missingCurrentRes.status).toBe(400);
    expect(missingCurrentRes.body.error.message).toContain("Current password is required");

    // 4. Attempt with wrong currentPassword -> should fail with 401
    const wrongCurrentRes = await request(app)
      .post("/api/v1/auth/set-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "WrongPassword999!",
        newPassword: "BrandNewPassword456!",
      });

    expect(wrongCurrentRes.status).toBe(401);
    expect(wrongCurrentRes.body.error.message).toContain("Current password is incorrect");

    // 5. Attempt with same newPassword as currentPassword -> should fail with 400
    const samePasswordRes = await request(app)
      .post("/api/v1/auth/set-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "InitialPassword123!",
        newPassword: "InitialPassword123!",
      });

    expect(samePasswordRes.status).toBe(400);
    expect(samePasswordRes.body.error.message).toContain("cannot be the same");

    // 6. Change password with valid currentPassword
    const changePassRes = await request(app)
      .post("/api/v1/auth/set-password")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        currentPassword: "InitialPassword123!",
        newPassword: "BrandNewPassword456!",
      });

    expect(changePassRes.status).toBe(200);
    expect(changePassRes.body.success).toBe(true);
    expect(changePassRes.body.message).toContain("Password updated successfully");

    // 7. Verify login with the new password works
    const newLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "passuser@example.com", password: "BrandNewPassword456!" });

    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.success).toBe(true);

    // Old password should fail
    const oldLoginRes = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "passuser@example.com", password: "InitialPassword123!" });

    expect(oldLoginRes.status).toBe(401);
  });
});
