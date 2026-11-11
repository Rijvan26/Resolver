import { Router } from "express";
import { settingsController } from "../controllers/settingsController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { updateOrganizationSchema } from "../validations/organizationValidation";
import { ROLES } from "../types";

const router = Router();

// Enforce authentication across canonical settings endpoint
router.use(authenticate);

/**
 * @route   GET /api/v1/settings
 * @desc    Get complete organization settings, AI toggles, and thresholds
 * @access  Authenticated (All active members)
 */
router.get("/", settingsController.getSettings);

/**
 * @route   PATCH /api/v1/settings
 * @desc    Update settings (name, statusPageEnabled, aiSettings)
 * @access  Authenticated (SUPER_ADMIN, ADMIN only)
 */
router.patch(
  "/",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(updateOrganizationSchema, "body"),
  settingsController.updateSettings
);

export default router;

