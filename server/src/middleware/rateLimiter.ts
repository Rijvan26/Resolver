import rateLimit from "express-rate-limit";
import { config } from "../config/config";

/**
 * Strict rate limiter for sensitive authentication endpoints (registration, login)
 * to mitigate brute force and credential stuffing attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.NODE_ENV === "test" ? 1000 : 20, // 20 requests per window in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many authentication attempts. Please try again after 15 minutes.",
    },
  },
});

/**
 * General rate limiter for invitation operations
 */
export const invitationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.NODE_ENV === "test" ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many invitation requests. Please try again later.",
    },
  },
});

/**
 * Per-source rate limiter for alert webhook ingestion (60 requests/minute per source/IP)
 */
export const alertRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.NODE_ENV === "test" ? 1000 : config.ALERT_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many alert ingestion requests. Please try again later.",
    },
  },
});

/**
 * Strict rate limiter for destructive organization deletion (5 requests/hour per IP/user)
 */
export const organizationDeletionRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.NODE_ENV === "test" ? 1000 : 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many organization deletion attempts. Please try again after 1 hour.",
    },
  },
});
