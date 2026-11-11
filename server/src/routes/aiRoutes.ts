import { Router } from "express";
import { aiController } from "../controllers/aiController";
import { runbookController } from "../controllers/runbookController";
import { assistantController } from "../controllers/assistantController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { ROLES } from "../types";
import {
  suggestionIdParamsSchema,
  recordDecisionBodySchema,
  incidentAiParamsSchema,
  triggerTriageBodySchema,
  listAuditLogQuerySchema,
  clarifyReportBodySchema,
  statusDraftBodySchema,
  assistantQueryBodySchema,
} from "../validations/aiValidation";
import { organizationAiSettingsSchema } from "../validations/organizationValidation";

const router = Router();

// Enforce authentication across all AI operations
router.use(authenticate);

/**
 * @route   GET /api/v1/ai/audit
 * @desc    Get paginated AI audit log & agreement rate metrics (FR-14)
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.get(
  "/audit",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(listAuditLogQuerySchema, "query"),
  aiController.getAuditLog
);

/**
 * @route   POST /api/v1/ai/suggestions/:id/decision
 * @desc    Record human-in-the-loop decision (Accept, Edit, Dismiss)
 * @access  Authenticated (Accept/Edit triage restricted to Manager, Admin, Super Admin)
 */
router.post(
  "/suggestions/:id/decision",
  validate(suggestionIdParamsSchema, "params"),
  validate(recordDecisionBodySchema, "body"),
  aiController.recordDecision
);

/**
 * Secondary alias: /api/v1/ai/suggestions/:suggestionId/decision
 */
router.post(
  "/suggestions/:suggestionId/decision",
  validate(suggestionIdParamsSchema, "params"),
  validate(recordDecisionBodySchema, "body"),
  aiController.recordDecision
);

/**
 * Convenience routes under /api/v1/ai/incidents/:id/...
 */
router.post(
  "/incidents/:id/triage",
  validate(incidentAiParamsSchema, "params"),
  validate(triggerTriageBodySchema, "body"),
  aiController.triggerTriage
);

router.post(
  "/incidents/:id/summary",
  validate(incidentAiParamsSchema, "params"),
  aiController.triggerSummary
);

router.post(
  "/incidents/:id/postmortem",
  validate(incidentAiParamsSchema, "params"),
  aiController.triggerPostmortem
);

router.post(
  "/reports/clarify",
  validate(clarifyReportBodySchema, "body"),
  aiController.clarifyReport
);

router.post(
  "/incidents/:id/status-draft",
  validate(incidentAiParamsSchema, "params"),
  validate(statusDraftBodySchema, "body"),
  aiController.triggerStatusDraft
);

router.get(
  "/incidents/:id/similar",
  validate(incidentAiParamsSchema, "params"),
  aiController.getSimilarIncidents
);

router.get(
  "/incidents/:id/runbooks",
  validate(incidentAiParamsSchema, "params"),
  runbookController.getSuggestedRunbooks
);

router.get(
  "/incidents/:id",
  validate(incidentAiParamsSchema, "params"),
  aiController.getIncidentAiStatus
);

/**
 * @route   GET /api/v1/ai/settings
 * @desc    Get current organization AI settings and thresholds
 * @access  Authenticated
 */
router.get("/settings", aiController.getSettings);

/**
 * @route   PATCH /api/v1/ai/settings
 * @desc    Update AI settings and thresholds
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.patch(
  "/settings",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(organizationAiSettingsSchema, "body"),
  aiController.updateSettings
);

/**
 * @route   POST /api/v1/ai/assistant/query
 * @desc    Execute natural-language read-only assistant query over allowlisted tools (FR-10)
 * @access  Authenticated
 */
router.post(
  "/assistant/query",
  validate(assistantQueryBodySchema, "body"),
  assistantController.query
);

export default router;

