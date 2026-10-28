import { Router } from "express";
import { dashboardController } from "../controllers/dashboardController";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import {
  dateRangeQuerySchema,
  recentActivityQuerySchema,
} from "../validations/dashboardValidation";

const router = Router();

// All dashboard endpoints require authentication and active user verification
router.use(authenticate);

/**
 * @route   GET /api/v1/dashboard/overview
 * @desc    High-level incident counts and KPI metrics
 * @access  Authenticated
 */
router.get(
  "/overview",
  validate(dateRangeQuerySchema, "query"),
  dashboardController.getOverview
);

/**
 * @route   GET /api/v1/dashboard/incidents-by-status
 * @desc    Counts of incidents grouped by status
 * @access  Authenticated
 */
router.get(
  "/incidents-by-status",
  validate(dateRangeQuerySchema, "query"),
  dashboardController.getIncidentsByStatus
);

/**
 * @route   GET /api/v1/dashboard/incidents-by-priority
 * @desc    Counts of incidents grouped by priority
 * @access  Authenticated
 */
router.get(
  "/incidents-by-priority",
  validate(dateRangeQuerySchema, "query"),
  dashboardController.getIncidentsByPriority
);

/**
 * @route   GET /api/v1/dashboard/incident-trends
 * @desc    Daily incident creation and resolution counts over date range
 * @access  Authenticated
 */
router.get(
  "/incident-trends",
  validate(dateRangeQuerySchema, "query"),
  dashboardController.getIncidentTrends
);

/**
 * @route   GET /api/v1/dashboard/team-workload
 * @desc    Active incident workload breakdown per eligible organization member
 * @access  Authenticated
 */
router.get("/team-workload", dashboardController.getTeamWorkload);

/**
 * @route   GET /api/v1/dashboard/recent-activity
 * @desc    Audit events across the organization with pagination
 * @access  Authenticated
 */
router.get(
  "/recent-activity",
  validate(recentActivityQuerySchema, "query"),
  dashboardController.getRecentActivity
);

export default router;

