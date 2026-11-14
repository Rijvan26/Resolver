import { Router } from "express";
import { invitationController } from "../controllers/invitationController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { invitationRateLimiter } from "../middleware/rateLimiter";
import {
  createInvitationSchema,
  acceptInvitationSchema,
} from "../validations/invitationValidation";
import { ROLES } from "../types";

const router = Router();

/**
 * @route   POST /api/v1/invitations
 * @desc    Create and dispatch a new organization member invitation
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.post(
  "/",
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  invitationRateLimiter,
  validate(createInvitationSchema),
  invitationController.createInvitation
);

/**
 * @route   GET /api/v1/invitations
 * @desc    List all invitations for the authenticated user's organization
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.get(
  "/",
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  invitationController.listInvitations
);

/**
 * @route   POST /api/v1/invitations/accept
 * @desc    Accept an invitation and register/provision member account
 * @access  Public (Requires valid invitation token, rate limited)
 */
router.post(
  "/accept",
  invitationRateLimiter,
  validate(acceptInvitationSchema),
  invitationController.acceptInvitation
);

/**
 * @route   POST /api/v1/invitations/:invitationId/resend
 * @desc    Resend an active pending invitation email
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.post(
  "/:invitationId/resend",
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  invitationRateLimiter,
  invitationController.resendInvitation
);

/**
 * @route   DELETE /api/v1/invitations/:invitationId
 * @desc    Revoke an active pending invitation
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.delete(
  "/:invitationId",
  authenticate,
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  invitationController.revokeInvitation
);

export default router;
