import { Router } from "express";
import { assistantController } from "../controllers/assistantController";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { assistantQueryBodySchema } from "../validations/aiValidation";

const router = Router();

// Enforce authentication for all assistant interactions
router.use(authenticate);

/**
 * @route   POST /assistant/query
 * @desc    Execute natural-language read-only assistant query over allowlisted tools (FR-10)
 * @access  Authenticated (User's RBAC scope strictly enforced)
 */
router.post(
  "/query",
  validate(assistantQueryBodySchema, "body"),
  assistantController.query
);

export default router;

