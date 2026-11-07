import { Router } from "express";
import { incidentController } from "../controllers/incidentController";
import { commentController } from "../controllers/commentController";
import { aiController } from "../controllers/aiController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  createIncidentSchema,
  updateIncidentSchema,
  updateAssigneeSchema,
  listIncidentsQuerySchema,
  incidentIdParamSchema,
} from "../validations/incidentValidation";
import {
  createCommentSchema,
  updateCommentSchema,
  commentParamsSchema,
  incidentOnlyParamSchema,
  listCommentsQuerySchema,
} from "../validations/commentValidation";
import { listTimelineQuerySchema } from "../validations/activityValidation";
import {
  incidentAiParamsSchema,
  triggerTriageBodySchema,
} from "../validations/aiValidation";
import { ROLES } from "../types";

const router = Router();

// Enforce authentication across all incident operations
router.use(authenticate);

/**
 * @route   POST /api/v1/incidents
 * @desc    Create a new incident
 * @access  Authenticated (All active members)
 */
router.post(
  "/",
  validate(createIncidentSchema, "body"),
  incidentController.createIncident
);

/**
 * @route   GET /api/v1/incidents
 * @desc    List incidents with pagination, filters, search, and sorting
 * @access  Authenticated (All active members)
 */
router.get(
  "/",
  validate(listIncidentsQuerySchema, "query"),
  incidentController.listIncidents
);

/**
 * @route   GET /api/v1/incidents/:incidentId
 * @desc    Retrieve a single incident by ID
 * @access  Authenticated (All active members)
 */
router.get(
  "/:incidentId",
  validate(incidentIdParamSchema, "params"),
  incidentController.getIncident
);

/**
 * @route   PATCH /api/v1/incidents/:incidentId
 * @desc    Update incident details and status
 * @access  Authenticated (All active members)
 */
router.patch(
  "/:incidentId",
  validate(incidentIdParamSchema, "params"),
  validate(updateIncidentSchema, "body"),
  incidentController.updateIncident
);

/**
 * @route   PATCH /api/v1/incidents/:incidentId/assignee
 * @desc    Assign or reassign an incident
 * @access  Authenticated (All active members)
 */
router.patch(
  "/:incidentId/assignee",
  validate(incidentIdParamSchema, "params"),
  validate(updateAssigneeSchema, "body"),
  incidentController.updateAssignee
);

/**
 * @route   DELETE /api/v1/incidents/:incidentId
 * @desc    Delete an incident
 * @access  Authenticated (SUPER_ADMIN, ADMIN)
 */
router.delete(
  "/:incidentId",
  authorize(ROLES.SUPER_ADMIN, ROLES.ADMIN),
  validate(incidentIdParamSchema, "params"),
  incidentController.deleteIncident
);

// ========================================================
// Incident Comments Sub-Resource Endpoints
// ========================================================

/**
 * @route   POST /api/v1/incidents/:incidentId/comments
 * @desc    Add a comment to an incident
 * @access  Authenticated (All active members)
 */
router.post(
  "/:incidentId/comments",
  validate(incidentOnlyParamSchema, "params"),
  validate(createCommentSchema, "body"),
  commentController.createComment
);

/**
 * @route   GET /api/v1/incidents/:incidentId/comments
 * @desc    List comments for an incident with pagination
 * @access  Authenticated (All active members)
 */
router.get(
  "/:incidentId/comments",
  validate(incidentOnlyParamSchema, "params"),
  validate(listCommentsQuerySchema, "query"),
  commentController.listComments
);

/**
 * @route   PATCH /api/v1/incidents/:incidentId/comments/:commentId
 * @desc    Update a comment (Author only)
 * @access  Authenticated (Original comment author)
 */
router.patch(
  "/:incidentId/comments/:commentId",
  validate(commentParamsSchema, "params"),
  validate(updateCommentSchema, "body"),
  commentController.updateComment
);

/**
 * @route   DELETE /api/v1/incidents/:incidentId/comments/:commentId
 * @desc    Delete a comment
 * @access  Authenticated (Author OR SUPER_ADMIN / ADMIN)
 */
router.delete(
  "/:incidentId/comments/:commentId",
  validate(commentParamsSchema, "params"),
  commentController.deleteComment
);

// ========================================================
// Incident Activity & Audit Timeline Endpoint
// ========================================================

/**
 * @route   GET /api/v1/incidents/:incidentId/timeline
 * @desc    Retrieve the persistent audit/activity timeline for an incident
 * @access  Authenticated (All active members)
 */
router.get(
  "/:incidentId/timeline",
  validate(incidentOnlyParamSchema, "params"),
  validate(listTimelineQuerySchema, "query"),
  incidentController.getIncidentTimeline
);

// ========================================================
// AI Assistant Sub-Resource Endpoints (SRS-AI-001)
// ========================================================

/**
 * @route   POST /api/v1/incidents/:incidentId/ai/triage
 * @desc    Trigger AI triage suggestion for an incident
 * @access  Authenticated
 */
router.post(
  "/:incidentId/ai/triage",
  validate(incidentAiParamsSchema, "params"),
  validate(triggerTriageBodySchema, "body"),
  aiController.triggerTriage
);

/**
 * @route   POST /api/v1/incidents/:incidentId/ai/summary
 * @desc    Generate or refresh AI status summary
 * @access  Authenticated
 */
router.post(
  "/:incidentId/ai/summary",
  validate(incidentAiParamsSchema, "params"),
  aiController.triggerSummary
);

/**
 * @route   POST /api/v1/incidents/:incidentId/ai/postmortem
 * @desc    Generate blameless postmortem draft (resolved/closed only)
 * @access  Authenticated
 */
router.post(
  "/:incidentId/ai/postmortem",
  validate(incidentAiParamsSchema, "params"),
  aiController.triggerPostmortem
);

/**
 * @route   GET /api/v1/incidents/:incidentId/ai
 * @desc    Get active AI state and latest suggestions for incident
 * @access  Authenticated
 */
router.get(
  "/:incidentId/ai",
  validate(incidentAiParamsSchema, "params"),
  aiController.getIncidentAiStatus
);

export default router;

