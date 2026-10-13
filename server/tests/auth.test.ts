import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES } from "../src/types";

describe("Authentication & Organization Registration API (/api/v1/auth)", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe("POST /api/v1/auth/register-organization", () => {
    it("should reject registration with missing or invalid fields (Zod validation)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register-organization")
        .send({
          organizationName: "A", // too short
          email: "not-an-email",
          password: "short", // less than 8 chars
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(Array.isArray(res.body.error.details)).toBe(true);
    });

    it("should successfully register organization and creator as SUPER_ADMIN", async () => {
      const payload = {
        organizationName: "Cloud Corp",
        creatorName: "Sarah Connor",
        email: "sarah@cloudcorp.com",
        password: "SuperSecurePassword123!",
      };

      const res = await request(app)
        .post("/api/v1/auth/register-organization")
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organization.name).toBe("Cloud Corp");
      expect(res.body.data.organization.slug).toBe("cloud-corp");
      expect(res.body.data.user.name).toBe("Sarah Connor");
      expect(res.body.data.user.email).toBe("sarah@cloudcorp.com");
      expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);

      // Verify no passwords or internal secrets are exposed in response
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password).toBeUndefined();

      // Verify database record has hashed password, NOT plaintext
      const dbUser = await userDao.findByEmail("sarah@cloudcorp.com", true);
      expect(dbUser).not.toBeNull();
      expect(dbUser?.passwordHash).not.toBe("SuperSecurePassword123!");
      expect(dbUser?.passwordHash.startsWith("$2")).toBe(true); // bcrypt prefix
    });

    it("should reject duplicate registration with conflicting email", async () => {
      const payload = {
        organizationName: "First Org",
        creatorName: "User One",
        email: "shared@example.com",
        password: "Password123!",
      };

      await request(app).post("/api/v1/auth/register-organization").send(payload);

      // Attempt second registration with same email but different org
      const secondRes = await request(app)
        .post("/api/v1/auth/register-organization")
        .send({
          organizationName: "Second Org",
          creatorName: "User Two",
          email: "shared@example.com",
          password: "Password123!",
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe("CONFLICT");
      expect(secondRes.body.error.message).toContain("email address already exists");
    });

    it("should reject duplicate registration with conflicting slug", async () => {
      const payload = {
        organizationName: "Tech Alpha",
        creatorName: "Alpha User",
        email: "alpha@example.com",
        password: "Password123!",
        slug: "tech-alpha",
      };

      await request(app).post("/api/v1/auth/register-organization").send(payload);

      // Attempt second registration with same slug
      const secondRes = await request(app)
        .post("/api/v1/auth/register-organization")
        .send({
          organizationName: "Tech Alpha Branch",
          creatorName: "Beta User",
          email: "beta@example.com",
          password: "Password123!",
          slug: "tech-alpha",
        });

      expect(secondRes.status).toBe(409);
      expect(secondRes.body.success).toBe(false);
      expect(secondRes.body.error.code).toBe("CONFLICT");
      expect(secondRes.body.error.message).toContain("slug");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await request(app).post("/api/v1/auth/register-organization").send({
        organizationName: "Login Org",
        creatorName: "John Doe",
        email: "john@loginorg.com",
        password: "Password123!",
      });
    });

    it("should reject login with non-existent email (generic error)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "unknown@nowhere.com", password: "Password123!" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
      expect(res.body.error.message).toBe("Invalid email or password");
    });

    it("should reject login with wrong password (generic error)", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "john@loginorg.com", password: "WrongPassword!" });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
      expect(res.body.error.message).toBe("Invalid email or password");
    });

    it("should succeed with valid credentials and return access token + refresh cookie", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "john@loginorg.com", password: "Password123!" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.user.email).toBe("john@loginorg.com");
      expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);

      // Verify HttpOnly cookie header is sent
      const cookies = res.headers["set-cookie"];
      expect(cookies).toBeDefined();
      const hasRefreshCookie = cookies.some((c: string) => c.includes("refreshToken"));
      expect(hasRefreshCookie).toBe(true);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("should reject access when no Bearer token is provided", async () => {
      const res = await request(app).get("/api/v1/auth/me");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("AUTHENTICATION_ERROR");
    });

    it("should reject access with invalid or forged token", async () => {
      const res = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer invalid.jwt.token");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should return user profile and organization details for authenticated user", async () => {
      // 1. Register
      await request(app).post("/api/v1/auth/register-organization").send({
        organizationName: "AuthMe Org",
        creatorName: "Me User",
        email: "me@authme.com",
        password: "Password123!",
      });

      // 2. Login
      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "me@authme.com", password: "Password123!" });

      const token = loginRes.body.data.accessToken;

      // 3. Get /me
      const meRes = await request(app)
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.user.email).toBe("me@authme.com");
      expect(meRes.body.data.user.name).toBe("Me User");
      expect(meRes.body.data.organization.name).toBe("AuthMe Org");
      expect(meRes.body.data.organization.slug).toBe("authme-org");
    });
  });

  describe("Refresh Token Lifecycle & Rotation (/api/v1/auth/refresh)", () => {
    it("should rotate refresh token and issue a new access token", async () => {
      // 1. Register & login
      await request(app).post("/api/v1/auth/register-organization").send({
        organizationName: "Refresh Org",
        creatorName: "Rotator",
        email: "rotator@refresh.com",
        password: "Password123!",
      });

      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "rotator@refresh.com", password: "Password123!" });

      const initialRefreshToken = loginRes.body.data.refreshToken;

      // 2. Refresh using token in body
      const refreshRes = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: initialRefreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).toBeDefined();
      expect(refreshRes.body.data.refreshToken).not.toBe(initialRefreshToken); // Rotated!

      // 3. Attempting to REUSE the old refresh token must trigger reuse detection and fail
      const reuseRes = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: initialRefreshToken });

      expect(reuseRes.status).toBe(401);
      expect(reuseRes.body.success).toBe(false);
      expect(reuseRes.body.error.message).toContain("reuse detected");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should invalidate refresh session and clear cookie", async () => {
      await request(app).post("/api/v1/auth/register-organization").send({
        organizationName: "Logout Org",
        creatorName: "Leaver",
        email: "leaver@logout.com",
        password: "Password123!",
      });

      const loginRes = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "leaver@logout.com", password: "Password123!" });

      const refreshToken = loginRes.body.data.refreshToken;

      const logoutRes = await request(app)
        .post("/api/v1/auth/logout")
        .send({ refreshToken });

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);
      expect(logoutRes.body.message).toContain("Logged out");

      // Verify the revoked token cannot be refreshed anymore
      const refreshAfterLogout = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });

      expect(refreshAfterLogout.status).toBe(401);
    });
  });
});
