import { describe, it, expect } from "vitest";
import { redact } from "../src/services/ai/redaction";

describe("AI Redaction Service (redact)", () => {
  describe("Passwords and Credentials", () => {
    it("should redact key-value passwords (equals sign)", () => {
      const input = "Connection failed for user admin with password=MySecretP@ssw0rd! on port 5432";
      const result = redact(input);
      expect(result).not.toContain("MySecretP@ssw0rd!");
      expect(result).toContain("password=[REDACTED_SECRET]");
    });

    it("should redact JSON style passwords and tokens", () => {
      const input = '{"username": "dev_user", "password": "super-secret-pwd", "client_secret": "xyz123"}';
      const result = redact(input);
      expect(result).not.toContain("super-secret-pwd");
      expect(result).not.toContain("xyz123");
      expect(result).toContain('"password": "[REDACTED_SECRET]"');
      expect(result).toContain('"client_secret": "[REDACTED_SECRET]"');
    });

    it("should redact authorization Bearer headers", () => {
      const input = "Request rejected: Authorization: Bearer a8f9c2d1e0b3456789abcdef";
      const result = redact(input);
      expect(result).not.toContain("a8f9c2d1e0b3456789abcdef");
      expect(result).toContain("[REDACTED_AUTH_HEADER]");
    });

    it("should redact JWT tokens", () => {
      const sampleJwt =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const input = `User session token was ${sampleJwt} during timeout.`;
      const result = redact(input);
      expect(result).not.toContain(sampleJwt);
      expect(result).toContain("[REDACTED_JWT_TOKEN]");
    });

    it("should redact PEM private keys", () => {
      const pemKey = `
-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y3e...fake...key...body...
-----END RSA PRIVATE KEY-----`;
      const input = `SSL error: private key was:${pemKey} and failed validation.`;
      const result = redact(input);
      expect(result).not.toContain("MIIEowIBAAKCAQEA0Y3e");
      expect(result).toContain("[REDACTED_PRIVATE_KEY]");
    });

    it("should redact vendor specific API keys (AWS, GitHub, Stripe)", () => {
      const input =
        "AWS key AKIAIOSFODNN7EXAMPLE and Github ghp_0123456789abcdefghijklmnopqrstuvwxyz and Stripe sk_live_51A2B3C4D5E6F7G8H9I0J1K2L3";
      const result = redact(input);
      expect(result).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(result).not.toContain("ghp_0123456789abcdefghijklmnopqrstuvwxyz");
      expect(result).not.toContain("sk_live_51A2B3C4D5E6F7G8H9I0J1K2L3");
      expect(result).toContain("[REDACTED_API_KEY]");
      expect(result).toContain("[REDACTED_TOKEN]");
    });
  });

  describe("Email Addresses", () => {
    it("should redact email addresses from error reports", () => {
      const input = "Incident reported by oncall-engineer@resolver.internal and cc john.doe@company.com";
      const result = redact(input);
      expect(result).not.toContain("oncall-engineer@resolver.internal");
      expect(result).not.toContain("john.doe@company.com");
      expect(result).toContain("[REDACTED_EMAIL]");
    });

    it("should preserve surrounding punctuation around emails", () => {
      const input = "Contact (alice.smith+alerts@example.co.uk).";
      const result = redact(input);
      expect(result).toBe("Contact ([REDACTED_EMAIL]).");
    });
  });

  describe("Phone Numbers", () => {
    it("should redact North American phone numbers", () => {
      const input = "Call commander at 1-800-555-0199 or (555) 234-5678 immediately.";
      const result = redact(input);
      expect(result).not.toContain("800-555-0199");
      expect(result).not.toContain("555) 234-5678");
      expect(result).toContain("[REDACTED_PHONE]");
    });

    it("should redact international phone numbers with plus prefix", () => {
      const input = "Secondary on-call phone is +44 20 7946 0991";
      const result = redact(input);
      expect(result).not.toContain("+44 20 7946 0991");
      expect(result).toContain("[REDACTED_PHONE]");
    });
  });

  describe("IP Addresses (IPv4 and IPv6)", () => {
    it("should redact IPv4 addresses by default", () => {
      const input = "Connection timeout connecting to replica at 192.168.1.105:5432 and gateway 10.0.0.1";
      const result = redact(input);
      expect(result).not.toContain("192.168.1.105");
      expect(result).not.toContain("10.0.0.1");
      expect(result).toContain("[REDACTED_IP]");
    });

    it("should redact IPv6 addresses", () => {
      const input = "Host 2001:0db8:85a3:0000:0000:8a2e:0370:7334 rejected handshake.";
      const result = redact(input);
      expect(result).not.toContain("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
      expect(result).toContain("[REDACTED_IP]");
    });

    it("should respect redactIps: false option when configured", () => {
      const input = "Connecting to 192.168.1.50 failed";
      const result = redact(input, { redactIps: false });
      expect(result).toContain("192.168.1.50");
    });
  });

  describe("Credit / Payment Cards", () => {
    it("should redact credit card numbers", () => {
      const input = "Payment failed for card 4111-2222-3333-4444 during checkout";
      const result = redact(input);
      expect(result).not.toContain("4111-2222-3333-4444");
      expect(result).toContain("[REDACTED_CARD]");
    });
  });

  describe("Real-world Incident Crash Log", () => {
    it("should comprehensively scrub a realistic production crash trace", () => {
      const crashLog = `
FATAL ERROR: Failed to connect to Redis cache at 10.240.0.12:6379
Error: Authentication failed with AUTH token=superSecretRedisAuthToken99!
Caller: payments-worker by engineer sarah.connor@acme-corp.com, phone +1 (415) 555-0132
Request payload: { "account": "10029", "apiKey": "AKIA1111222233334444", "status": "FAIL" }
Stack trace: at DatabasePool.connect (redis.js:42:15)
      `;

      const sanitized = redact(crashLog);

      // Verify no sensitive tokens survived
      expect(sanitized).not.toContain("10.240.0.12");
      expect(sanitized).not.toContain("superSecretRedisAuthToken99!");
      expect(sanitized).not.toContain("sarah.connor@acme-corp.com");
      expect(sanitized).not.toContain("555-0132");
      expect(sanitized).not.toContain("AKIA1111222233334444");

      // Verify legitimate non-sensitive structural text was preserved
      expect(sanitized).toContain("FATAL ERROR: Failed to connect to Redis cache");
      expect(sanitized).toContain("DatabasePool.connect (redis.js:42:15)");
      expect(sanitized).toContain('"account": "10029"');
    });
  });

  describe("Edge cases", () => {
    it("should handle empty strings safely", () => {
      expect(redact("")).toBe("");
    });

    it("should handle strings without sensitive data safely without modification", () => {
      const plainText = "High CPU utilization on Kubernetes node worker-03. Load average is 14.2.";
      expect(redact(plainText)).toBe(plainText);
    });

    it("should handle null/undefined safely", () => {
      expect(redact(null as any)).toBe("");
      expect(redact(undefined as any)).toBe("");
    });
  });
});

