import { Router } from "express";
import { authController } from "../controllers/authController";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { authRateLimiter } from "../middleware/rateLimiter";
import {
  registerOrganizationSchema,
  loginSchema,
  refreshTokenSchema,
} from "../validations/authValidation";

const router = Router();

/**
 * @route   POST /api/v1/auth/register-organization
 * @desc    Register a new organization and initial Super Admin user
 * @access  Public (Rate limited)
 */
router.post(
  "/register-organization",
  authRateLimiter,
  validate(registerOrganizationSchema),
  authController.registerOrganization
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticate employee and return access token + refresh cookie
 * @access  Public (Rate limited)
 */
router.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Rotate refresh token and issue new token pair
 * @access  Public (Requires valid refresh token)
 */
router.post(
  "/refresh",
  validate(refreshTokenSchema),
  authController.refresh
);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidate refresh token session and clear cookies
 * @access  Public / Authenticated
 */
router.post("/logout", authController.logout);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get currently authenticated user and organization profile
 * @access  Authenticated (Bearer token)
 */
router.get("/me", authenticate, authController.getMe);

export default router;
