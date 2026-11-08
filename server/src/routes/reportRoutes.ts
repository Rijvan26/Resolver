import { Router } from "express";
import { aiController } from "../controllers/aiController";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { clarifyReportBodySchema } from "../validations/aiValidation";

const router = Router();

router.use(authenticate);

/**
 * @route   POST /api/v1/reports/ai/clarify
 * @desc    Clarify draft incident report with cheap heuristics + LLM fallback (FR-05)
 * @access  Authenticated
 */
router.post(
  "/ai/clarify",
  validate(clarifyReportBodySchema, "body"),
  aiController.clarifyReport
);

export default router;

