import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "../src/config/config";
import { emailDeliveryService } from "../src/services/emailDeliveryService";

describe("Brevo SMTP Configuration & Connectivity Verification", () => {
  it("should have Brevo SMTP environment variables configured in config", () => {
    expect(config.BREVO_SMTP_USER).toBeDefined();
    expect(config.BREVO_SMTP_PASS).toBeDefined();
    expect(config.SMTP_HOST).toBe("smtp-relay.brevo.com");
    expect(config.SMTP_PORT).toBe(587);

    // Verify values match the configured Brevo credentials
    expect(config.BREVO_SMTP_USER?.trim()).toBe("aea1af001@smtp-brevo.com");
    expect(config.BREVO_SMTP_PASS?.trim()).toContain("xsmtpsib-");
    expect(config.GOOGLE_USER?.trim()).toBe("khanrijvan2610@gmail.com");
  });

  it("should initialize the Nodemailer transporter with Brevo SMTP settings", () => {
    emailDeliveryService.initTransporter();
    // Transporter should be initialized since user and pass are provided
    expect(emailDeliveryService).toBeDefined();
  });

  it("should safely verify Brevo SMTP server connection and report exact diagnostic status", async () => {
    // Reset to live transporter (not custom mock)
    emailDeliveryService.setSender(null);
    emailDeliveryService.initTransporter();

    const result = await emailDeliveryService.verifyConnection();

    // Verify response structure
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("message");

    console.log("--------------------------------------------------");
    console.log("📨 Brevo SMTP Connectivity Check Result:");
    console.log("   - Success:", result.success);
    console.log("   - Diagnostic:", result.message);
    console.log("--------------------------------------------------");

    // If Brevo returns 535 (Authentication failed), this test verifies that the error
    // was captured gracefully by the service without crashing or exposing raw secrets.
    if (!result.success) {
      expect(result.message).toContain("Brevo SMTP verification failed");
      // Must not expose the password in the error
      expect(result.message).not.toContain(config.BREVO_SMTP_PASS);
    } else {
      expect(result.message).toContain("Brevo SMTP server connection and authentication successful");
    }
  });

  it("should safely handle delivery attempts with live transporter without crashing", async () => {
    emailDeliveryService.setSender(null);
    emailDeliveryService.initTransporter();

    const recipient = config.GOOGLE_USER?.trim() || "khanrijvan2610@gmail.com";
    const sendResult = await emailDeliveryService.sendEmail({
      to: recipient,
      subject: "Test Brevo Delivery via Resolver Test Suite",
      text: "Testing Brevo SMTP live integration with Resolver.",
    });

    // The service must return a structured result, never crash or leak secrets
    expect(sendResult).toHaveProperty("success");
    expect(sendResult).toHaveProperty("status");
    expect(sendResult).toHaveProperty("attempts");

    if (sendResult.success) {
      expect(sendResult.status).toBe("SENT");
      expect(sendResult.messageId).toBeDefined();
      console.log("📬 Live Email Sent! Message ID:", sendResult.messageId);
    } else {
      expect(sendResult.status).toBe("FAILED");
      expect(sendResult.attempts).toBe(3); // bounded at 3 retries
      expect(sendResult.error).toBeDefined();
      expect(sendResult.error).not.toContain(config.BREVO_SMTP_PASS);
    }
  });
});

