import { Router } from "express";
import { organizationController } from "../controllers/organizationController";
import { settingsController } from "../controllers/settingsController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  updateOrganizationSchema,
  listMembersQuerySchema,
  memberIdParamSchema,
  updateMemberRoleSchema,
  updateMemberStatusSchema,
} from "../validations/organizationValidation";
import { ROLES } from "../types";

const router = Router();

// Enforce authentication across all organization & member routes
router.use(authenticate);

/**
 * @route   GET /api/v1/organizations/me
 * @desc    Get authenticated user's organization profile (Aliased to canonical /settings)
 * @access  Authenticated (All active members)
 */
router.get(
  "/me",
  settingsController.getSettings
);

/**
 * @route   PATCH /api/v1/organizations/me
 * @desc    Update organization settings (Aliased to canonical /settings)
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.patch(
  "/me",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(updateOrganizationSchema, "body"),
  settingsController.updateSettings
);

/**
 * @route   GET /api/v1/organizations/me/members
 * @desc    List members in authenticated user's organization
 * @access  Authenticated (All active members)
 */
router.get(
  "/me/members",
  validate(listMembersQuerySchema, "query"),
  organizationController.listMembers
);

/**
 * @route   GET /api/v1/organizations/me/members/:memberId
 * @desc    Get details of a specific member in the organization
 * @access  Authenticated (All active members)
 */
router.get(
  "/me/members/:memberId",
  validate(memberIdParamSchema, "params"),
  organizationController.getMember
);

/**
 * @route   PATCH /api/v1/organizations/me/members/:memberId/role
 * @desc    Update a member's role (enforces role boundary policies & Super Admin protection)
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.patch(
  "/me/members/:memberId/role",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(memberIdParamSchema, "params"),
  validate(updateMemberRoleSchema, "body"),
  organizationController.updateMemberRole
);

/**
 * @route   PATCH /api/v1/organizations/me/members/:memberId/status
 * @desc    Activate or deactivate a member
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.patch(
  "/me/members/:memberId/status",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(memberIdParamSchema, "params"),
  validate(updateMemberStatusSchema, "body"),
  organizationController.updateMemberStatus
);

export default router;
