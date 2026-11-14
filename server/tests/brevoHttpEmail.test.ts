import { describe, it, expect, beforeEach, afterEach, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { emailDeliveryService } from "../src/services/emailDeliveryService";
import { organizationDao } from "../src/dao/organizationDao";
import { userDao } from "../src/dao/userDao";
import { invitationDao } from "../src/dao/invitationDao";
import { ROLES } from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";

describe("Brevo HTTP API Email Delivery (HTTPS over Port 443)", () => {
  const originalFetch = globalThis.fetch;
  const originalEnvApiKey = process.env.EMAIL_API_KEY;
  const originalEnvEmailFrom = process.env.EMAIL_FROM;

  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  }, 30000);

  beforeEach(async () => {
    await clearTestDb();
    process.env.EMAIL_API_KEY = "test_brevo_api_key_secret_12345";
    process.env.EMAIL_FROM = "notifications@resolver.internal";
    emailDeliveryService.setSender(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env.EMAIL_API_KEY = originalEnvApiKey;
    process.env.EMAIL_FROM = originalEnvEmailFrom;
    emailDeliveryService.setSender(null);
    emailDeliveryService.setLiveInTest(false);
    vi.restoreAllMocks();
  });

  it("should send request to correct URL with correct headers and JSON body on success", async () => {
    let capturedUrl = "";
    let capturedOptions: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string | URL | Request, options?: RequestInit) => {
      capturedUrl = String(url);
      capturedOptions = options;
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "<brevo-test-success-id-789>" }),
      } as Response;
    });

    const result = await emailDeliveryService.sendViaBrevoHttp({
      to: "invitee@example.com",
      subject: "Invitation to Join Platform",
      text: "Please join our team here: https://resolver.vercel.app/accept-invitation?token=xyz",
      html: "<p>Please join our team</p>",
    });

    // 1. Verify URL
    expect(capturedUrl).toBe("https://api.brevo.com/v3/smtp/email");

    // 2. Verify Headers
    expect(capturedOptions?.method).toBe("POST");
    const headers = capturedOptions?.headers as Record<string, string>;
    expect(headers["api-key"]).toBe("test_brevo_api_key_secret_12345");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["accept"]).toBe("application/json");

    // 3. Verify Body
    const body = JSON.parse(capturedOptions?.body as string);
    expect(body).toEqual({
      sender: {
        name: "Resolver",
        email: "notifications@resolver.internal",
      },
      to: [
        {
          email: "invitee@example.com",
        },
      ],
      subject: "Invitation to Join Platform",
      htmlContent: "<p>Please join our team</p>",
      textContent: "Please join our team here: https://resolver.vercel.app/accept-invitation?token=xyz",
    });

    // 4. Verify Returned Message ID
    expect(result.messageId).toBe("<brevo-test-success-id-789>");
  });

  it("should handle 401 Unauthorized cleanly and return clear error without leaking API key", async () => {
    const secretApiKey = "secret_brevo_key_never_leak_this";
    process.env.EMAIL_API_KEY = secretApiKey;

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 401,
        json: async () => ({ message: "Key not found", code: "unauthorized" }),
      } as Response;
    });

    await expect(
      emailDeliveryService.sendViaBrevoHttp({
        to: "user@example.com",
        subject: "Subject",
        text: "Content",
      })
    ).rejects.toThrow("Brevo HTTP API delivery failed with status 401: Key not found");

    // Test through sendEmail wrapper
    emailDeliveryService.setLiveInTest(true);
    const result = await emailDeliveryService.sendEmail({
      to: "user@example.com",
      subject: "Subject",
      text: "Content",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("status 401");
    // Ensure API key is NEVER leaked in error text
    expect(result.error).not.toContain(secretApiKey);
  });

  it("should handle timeout gracefully when fetch request exceeds deadline", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, opts) => {
      return new Promise((_resolve, reject) => {
        const abortErr = new Error("The operation was aborted");
        abortErr.name = "AbortError";
        // Immediately abort or listen to signal
        if (opts?.signal?.aborted) {
          return reject(abortErr);
        }
        opts?.signal?.addEventListener("abort", () => reject(abortErr));
        setTimeout(() => reject(abortErr), 10);
      });
    });

    await expect(
      emailDeliveryService.sendViaBrevoHttp({
        to: "user@example.com",
        subject: "Timeout Test",
        text: "Content",
      })
    ).rejects.toThrow("Brevo HTTP API request timed out after 10000ms");
  });

  it("should still create the invitation in MongoDB and return 201 with warning when email sending fails", async () => {
    const org = await organizationDao.create({ name: "Resilient Org", slug: "resilient-org" });
    const superAdmin = await userDao.create({
      name: "Admin User",
      email: "admin@resilient-org.com",
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

    // Mock fetch to simulate Brevo HTTP failure (e.g. 500 error)
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        json: async () => ({ message: "Brevo internal server error" }),
      } as Response;
    });

    emailDeliveryService.setLiveInTest(true);

    const inviteeEmail = "engineer@example.com";
    const res = await request(app)
      .post("/api/v1/invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: inviteeEmail,
        role: ROLES.DEVELOPER,
      });

    // 1. HTTP 201 response must still succeed
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // 2. Warning must be surfaced to the UI
    expect(res.body.warning).toBe("Email could not be sent");
    expect(res.body.data.emailSent).toBe(false);
    expect(res.body.data.warning).toBe("Email could not be sent");

    // 3. Invitation link must still be generated so the user can copy it manually
    expect(res.body.data.invitationLink).toBeDefined();
    expect(res.body.data.invitationLink).toContain("/accept-invitation?token=");

    // 4. Invitation must be safely persisted in the database
    const dbInvitation = await invitationDao.findById(res.body.data.id);
    expect(dbInvitation).toBeDefined();
    expect(dbInvitation?.status).toBe("PENDING");
    expect(dbInvitation?.email).toBe(inviteeEmail);
  });
});
