import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { User } from "../src/models/User";
import { ROLES } from "../src/types";
import { hashPassword } from "../src/utils/passwordUtils";

describe("Forgot and Reset Password Flow (/api/v1/auth)", () => {
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

  describe("POST /api/v1/auth/forgot-password", () => {
    it("should reject request with missing or invalid email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "not-an-email" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should return generic success message even if account does not exist (anti-enumeration)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "nonexistent@example.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("If an account with that email exists");
      expect(res.body.data.resetToken).toBeUndefined();
    });

    it("should generate a reset token and set expiry on existing user account", async () => {
      const org = await organizationDao.create({
        name: "Acme Corp",
        slug: "acme-corp",
        statusPageEnabled: false,
      });

      const initialHash = await hashPassword("OldPassword123!");
      const user = await userDao.create({
        name: "Jane Doe",
        email: "jane@acme.com",
        passwordHash: initialHash,
        role: ROLES.ADMIN,
        organizationId: org._id,
        isActive: true,
      });

      const res = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "jane@acme.com" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.resetToken).toBeDefined();

      // Verify token hash is stored in DB
      const userInDb = await User.findById(user._id).select("+passwordResetTokenHash +passwordResetExpiresAt");
      expect(userInDb?.passwordResetTokenHash).toBeDefined();
      expect(userInDb?.passwordResetExpiresAt).toBeDefined();
      expect(new Date(userInDb!.passwordResetExpiresAt!).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("POST /api/v1/auth/reset-password", () => {
    it("should reject reset request with invalid or missing fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({ token: "short", newPassword: "123" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it("should reject reset request with an invalid or expired token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
          newPassword: "BrandNewPassword123!",
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("invalid or has expired");
    });

    it("should successfully reset password, clear reset token, and permit login with new password", async () => {
      // 1. Setup user
      const org = await organizationDao.create({
        name: "Security Org",
        slug: "security-org",
        statusPageEnabled: false,
      });

      const user = await userDao.create({
        name: "Bob Smith",
        email: "bob@security.com",
        passwordHash: await hashPassword("OldPassword123!"),
        role: ROLES.MANAGER,
        organizationId: org._id,
        isActive: true,
      });

      // 2. Request forgot password
      const forgotRes = await request(app)
        .post("/api/v1/auth/forgot-password")
        .send({ email: "bob@security.com" });

      expect(forgotRes.status).toBe(200);
      const resetToken = forgotRes.body.data.resetToken;
      expect(resetToken).toBeDefined();

      // 3. Reset password using token
      const resetRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: resetToken,
          newPassword: "BrandNewSecurePassword456!",
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(resetRes.body.message).toContain("reset successfully");

      // 4. Verify token was cleared from DB
      const userInDb = await User.findById(user._id).select("+passwordResetTokenHash +passwordResetExpiresAt");
      expect(userInDb?.passwordResetTokenHash).toBeUndefined();
      expect(userInDb?.passwordResetExpiresAt).toBeUndefined();

      // 5. Verify old password no longer works
      const oldLoginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "bob@security.com", password: "OldPassword123!" });

      expect(oldLoginRes.status).toBe(401);

      // 6. Verify new password logs in successfully
      const newLoginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "bob@security.com", password: "BrandNewSecurePassword456!" });

      expect(newLoginRes.status).toBe(200);
      expect(newLoginRes.body.success).toBe(true);
      expect(newLoginRes.body.data.user.email).toBe("bob@security.com");

      // 7. Verify token cannot be reused
      const reuseRes = await request(app)
        .post("/api/v1/auth/reset-password")
        .send({
          token: resetToken,
          newPassword: "YetAnotherPassword789!",
        });

      expect(reuseRes.status).toBe(401);
    });
  });
});
