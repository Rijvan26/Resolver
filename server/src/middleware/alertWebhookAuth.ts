import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { config } from "../config/config";
import { verifyAccessToken } from "../utils/tokenUtils";
import { userDao } from "../dao/userDao";
import { AuthenticationError } from "../utils/errors";

/**
 * Constant-time string comparison to prevent timing side-channel attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      // Execute dummy timing to prevent length leak
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Computes the HMAC-SHA256 signature of a payload using the alert ingest secret.
 */
export function computeAlertHmac(payload: unknown, secret: string = config.ALERT_INGEST_SECRET): string {
  const content = typeof payload === "string" ? payload : JSON.stringify(payload);
  return crypto.createHmac("sha256", secret).update(content).digest("hex");
}

/**
 * Webhook authentication middleware for alert ingestion.
 *
 * Supported Authentication Methods:
 * 1. Shared Secret Header: `X-Resolver-Secret: <secret>`
 * 2. HMAC Signature Header: `X-Resolver-Signature: <hex>` (HMAC SHA-256 of body)
 * 3. Authorization Header:
 *    - `Bearer <secret>` matching ALERT_INGEST_SECRET
 *    - `Bearer <jwt>` valid user JWT access token
 *
 * Rejects missing or invalid credentials with 401 Unauthorized.
 */
export async function alertWebhookAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const secretHeader = (req.headers["x-resolver-secret"] as string) || "";
  const signatureHeader = (req.headers["x-resolver-signature"] as string) || "";
  const authHeader = (req.headers["authorization"] as string) || "";

  // 1. Shared Secret Verification via X-Resolver-Secret
  if (secretHeader) {
    if (timingSafeCompare(secretHeader, config.ALERT_INGEST_SECRET)) {
      return next();
    }
    return next(new AuthenticationError("Invalid alert webhook secret"));
  }

  // 2. HMAC-SHA256 Signature Verification via X-Resolver-Signature
  if (signatureHeader) {
    const expectedHmac = computeAlertHmac(req.body);
    if (timingSafeCompare(signatureHeader, expectedHmac)) {
      return next();
    }
    return next(new AuthenticationError("Invalid alert webhook HMAC signature"));
  }

  // 3. Authorization Header Verification
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();

    // 3a. Token matches shared secret directly
    if (timingSafeCompare(token, config.ALERT_INGEST_SECRET)) {
      return next();
    }

    // 3b. Fallback: Check if token is a valid user JWT
    try {
      const decoded = verifyAccessToken(token);
      const user = await userDao.findById(decoded.userId);
      if (user && user.isActive) {
        req.user = {
          userId: user._id.toString(),
          organizationId: user.organizationId.toString(),
          role: user.role,
          email: user.email,
        };
        return next();
      }
    } catch {
      // Token is neither valid secret nor valid user JWT
    }
  }

  // Missing or unrecognized authentication credentials
  return next(new AuthenticationError("Missing or invalid alert ingestion secret or signature"));
}
