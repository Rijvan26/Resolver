import jwt, { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/config";
import { AuthUserPayload } from "../types";
import { AuthenticationError } from "./errors";

/**
 * Generate a short-lived access JWT.
 */
export const generateAccessToken = (payload: AuthUserPayload): string => {
  const options: SignOptions = {
    expiresIn: config.JWT_ACCESS_EXPIRES_IN as unknown as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, options);
};

/**
 * Verify and decode an access JWT.
 */
export const verifyAccessToken = (token: string): AuthUserPayload => {
  try {
    const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AuthUserPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError("Access token has expired");
    }
    throw new AuthenticationError("Invalid access token");
  }
};

/**
 * Generate a cryptographically secure random refresh token string.
 */
export const generateRefreshToken = (): string => {
  return crypto.randomBytes(40).toString("hex");
};

/**
 * Hash a token using SHA-256 for secure database storage.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

/**
 * Generate a cryptographically secure random token (e.g. for member invitations).
 */
export const generateRandomToken = (bytes = 32): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

/**
 * Convert a string into a URL-safe lowercase slug.
 */
export const slugify = (text: string): string => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w-]+/g, "") // Remove all non-word chars
    .replace(/--+/g, "-") // Replace multiple - with single -
    .replace(/^-+/, "") // Trim - from start of text
    .replace(/-+$/, ""); // Trim - from end of text
};
