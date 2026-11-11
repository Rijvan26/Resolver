import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/**
 * Validates alert intake payload (POST /api/v1/alerts)
 */
export const ingestAlertSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Alert title must be at least 2 characters")
      .max(200, "Alert title cannot exceed 200 characters"),
    description: z
      .string()
      .trim()
      .min(2, "Alert description must be at least 2 characters")
      .max(5000, "Alert description cannot exceed 5000 characters"),
    severity: z
      .enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"])
      .default("MEDIUM"),
    serviceId: z
      .string()
      .regex(objectIdRegex, "Valid Service ID required"),
    source: z.string().trim().optional().default("custom"),
    fingerprint: z.string().trim().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type IngestAlertInput = z.infer<typeof ingestAlertSchema>;

/**
 * Validates incident ID in URL parameters
 */
export const incidentAlertsParamsSchema = z
  .object({
    id: z.string().regex(objectIdRegex, "Valid Incident ID is required"),
  })
  .strict();

/**
 * Validates alert decision parameters and body
 */
export const groupDecisionParamsSchema = z
  .object({
    id: z.string().regex(objectIdRegex, "Valid Incident ID is required"),
    alertId: z.string().regex(objectIdRegex, "Valid Alert ID is required"),
  })
  .strict();

export const incidentAlertDecisionParamsSchema = z
  .object({
    incidentId: z.string().regex(objectIdRegex, "Valid Incident ID is required"),
    alertId: z.string().regex(objectIdRegex, "Valid Alert ID is required"),
  })
  .strict();

export const groupDecisionBodySchema = z
  .object({
    decision: z.enum(["accept", "dismiss"]),
  })
  .strict();

export type GroupDecisionInput = z.infer<typeof groupDecisionBodySchema>;
