import express, { Router } from "express";
import { alertController } from "../controllers/alertController";
import { alertWebhookAuth } from "../middleware/alertWebhookAuth";
import { alertRateLimiter } from "../middleware/rateLimiter";
import { validate } from "../middleware/validate";
import { ingestAlertSchema } from "../validations/alertValidation";

const router = Router();

// Body size limit for alert payloads (25kb limit)
router.use(express.json({ limit: "25kb" }));

// Per-source rate limiting & Webhook authentication (secret / HMAC / Bearer)
router.use(alertRateLimiter);
router.use(alertWebhookAuth);

/**
 * @route   POST /api/v1/alerts and POST /api/v1/alerts/ingest
 * @desc    Ingest and group an alert with HMAC/secret auth, body bounding & flood protection
 * @access  Webhook Secret / HMAC Signature / Authenticated User
 */
router.post(
  "/",
  validate(ingestAlertSchema, "body"),
  alertController.ingestAlert
);

router.post(
  "/ingest",
  validate(ingestAlertSchema, "body"),
  alertController.ingestAlert
);

export default router;
