import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import request from "supertest";
import app from "../src/app";
import { setupTestDb, clearTestDb, teardownTestDb } from "./testDb";
import { userDao } from "../src/dao/userDao";
import { organizationDao } from "../src/dao/organizationDao";
import { ROLES } from "../src/types";
import { generateAccessToken } from "../src/utils/tokenUtils";
import { emailDeliveryService } from "../src/services/emailDeliveryService";

describe("Invitation Email Delivery Verification", () => {
  beforeAll(async () => {
    await setupTestDb();
  }, 30000);

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  it("should dispatch an email containing the accept-invitation link when an invitation is created", async () => {
    const org = await organizationDao.create({ name: "Acme Cloud", slug: "acme-cloud" });
    const superAdmin = await userDao.create({
      name: "Alice Owner",
      email: "alice@acme-cloud.com",
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

    // Mock the emailDeliveryService.sendEmail to capture outgoing invitation emails
    const capturedEmails: any[] = [];
    emailDeliveryService.setSender(async (payload) => {
      capturedEmails.push(payload);
      return { messageId: "test-msg-id-12345" };
    });

    const inviteeEmail = "bob.dev@example.com";
    const res = await request(app)
      .post("/api/v1/invitations")
      .set("Authorization", `Bearer ${token}`)
      .send({
        email: inviteeEmail,
        role: ROLES.DEVELOPER,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify email was dispatched!
    expect(capturedEmails.length).toBe(1);
    const sentEmail = capturedEmails[0];
    expect(sentEmail.to).toBe(inviteeEmail);
    expect(sentEmail.subject).toContain("Acme Cloud");
    expect(sentEmail.text).toContain("Alice Owner");
    expect(sentEmail.text).toContain("DEVELOPER");
    expect(sentEmail.text).toContain("/accept-invitation?token=");
    expect(sentEmail.html).toContain("Accept Invitation");
    expect(sentEmail.html).toContain("/accept-invitation?token=");

    // Clean up sender mock
    emailDeliveryService.setSender(null);
  });
});
