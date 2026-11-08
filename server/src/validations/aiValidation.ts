import { z } from "zod";
import { Types } from "mongoose";
import { AI_USER_DECISION, AI_SUGGESTION_TYPE } from "../types";

/**
 * Validates that a string is a valid MongoDB ObjectId
 */
const objectIdSchema = z
  .string()
  .trim()
  .refine((val) => Types.ObjectId.isValid(val), {
    message: "Must be a valid 24-character hexadecimal ObjectId",
  });

/**
 * Validates incident ID from params (supports :incidentId or :id)
 */
export const incidentAiParamsSchema = z
  .object({
    incidentId: objectIdSchema.optional(),
    id: objectIdSchema.optional(),
  })
  .refine((data) => Boolean(data.incidentId || data.id), {
    message: "Valid incident ID is required in URL parameters",
  });

/**
 * Validates suggestion ID from params (supports :suggestionId or :id)
 */
export const suggestionIdParamsSchema = z
  .object({
    suggestionId: objectIdSchema.optional(),
    id: objectIdSchema.optional(),
  })
  .refine((data) => Boolean(data.suggestionId || data.id), {
    message: "Valid suggestion ID is required in URL parameters",
  });

/**
 * Validates optional alert payload when requesting triage
 */
export const triggerTriageBodySchema = z
  .object({
    alert: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.string().optional(),
        errorRate: z.number().optional(),
        latencyP99Ms: z.number().optional(),
      })
      .optional(),
  })
  .strict();

/**
 * Validates human-in-the-loop decision payload
 */
export const recordDecisionBodySchema = z
  .object({
    decision: z.preprocess(
      (val) => (val === "link" ? AI_USER_DECISION.ACCEPTED : val),
      z.enum([
        AI_USER_DECISION.ACCEPTED,
        AI_USER_DECISION.EDITED,
        AI_USER_DECISION.DISMISSED,
      ])
    ),
    targetIncidentId: z.string().optional(),
    editedOutput: z.record(z.string(), z.unknown()).optional(),
  });

/**
 * Validates query parameters for AI audit log listing and metrics (FR-14)
 */
export const listAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z
    .enum([
      AI_SUGGESTION_TYPE.TRIAGE,
      AI_SUGGESTION_TYPE.SUMMARY,
      AI_SUGGESTION_TYPE.POSTMORTEM,
      AI_SUGGESTION_TYPE.DUPLICATE,
    ])
    .optional(),
  decision: z
    .enum([
      AI_USER_DECISION.PENDING,
      AI_USER_DECISION.ACCEPTED,
      AI_USER_DECISION.EDITED,
      AI_USER_DECISION.DISMISSED,
    ])
    .optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListAuditLogQueryInput = z.infer<typeof listAuditLogQuerySchema>;
