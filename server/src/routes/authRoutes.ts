import { Router } from "express";
import { authController } from "../controllers/authController";
import { validate } from "../middleware/validate";
import { authenticate } from "../middleware/authenticate";
import { authRateLimiter } from "../middleware/rateLimiter";
import {
  registerOrganizationSchema,
  loginSchema,
  refreshTokenSchema,
  googleAuthSchema,
  completeGoogleSetupSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validations/authValidation";

const router = Router();

/**
 * @route   POST /api/v1/auth/google
 * @desc    Authenticate with Google OAuth ID token
 * @access  Public (Rate limited)
 */
router.post(
  "/google",
  authRateLimiter,
  validate(googleAuthSchema),
  authController.googleAuth
);

/**
 * @route   POST /api/v1/auth/google/complete-setup
 * @desc    Complete workspace setup for brand new Google users
 * @access  Public (Rate limited)
 */
router.post(
  "/google/complete-setup",
  authRateLimiter,
  validate(completeGoogleSetupSchema),
  authController.completeGoogleSetup
);

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

/**
 * @route   POST /api/v1/auth/set-password
 * @desc    Set password for Google OAuth users or change password for existing accounts
 * @access  Authenticated (Rate limited)
 */
router.post(
  "/set-password",
  authenticate,
  authRateLimiter,
  validate(setPasswordSchema),
  authController.setPassword
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request a password reset link
 * @access  Public (Rate limited)
 */
router.post(
  "/forgot-password",
  authRateLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using a token
 * @access  Public (Rate limited)
 */
router.post(
  "/reset-password",
  authRateLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

export default router;
