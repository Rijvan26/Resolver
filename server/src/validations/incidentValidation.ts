import { z } from "zod";
import { Types } from "mongoose";
import { INCIDENT_STATUS, INCIDENT_PRIORITY } from "../types";

/**
 * Validates that a string is a valid MongoDB ObjectId.
 */
const objectIdSchema = z
  .string()
  .trim()
  .refine((val) => Types.ObjectId.isValid(val), {
    message: "Must be a valid 24-character hexadecimal ObjectId",
  });

/**
 * Schema for creating a new incident.
 * Organization ID and createdBy are derived from server-side context and rejected if passed by client.
 */
export const createIncidentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Title must be at least 2 characters")
      .max(200, "Title cannot exceed 200 characters"),
    description: z
      .string()
      .trim()
      .min(2, "Description must be at least 2 characters")
      .max(5000, "Description cannot exceed 5000 characters"),
    status: z
      .enum([
        INCIDENT_STATUS.OPEN,
        INCIDENT_STATUS.IN_PROGRESS,
        INCIDENT_STATUS.RESOLVED,
        INCIDENT_STATUS.CLOSED,
      ])
      .default(INCIDENT_STATUS.OPEN),
    priority: z
      .enum([
        INCIDENT_PRIORITY.LOW,
        INCIDENT_PRIORITY.MEDIUM,
        INCIDENT_PRIORITY.HIGH,
        INCIDENT_PRIORITY.CRITICAL,
      ])
      .default(INCIDENT_PRIORITY.MEDIUM),
    assigneeId: objectIdSchema.nullable().optional(),
  })
  .strict();

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

/**
 * Schema for updating incident details and status.
 * Rejects attempts to modify protected fields like organizationId, createdBy, or _id.
 */
export const updateIncidentSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Title must be at least 2 characters")
      .max(200, "Title cannot exceed 200 characters")
      .optional(),
    description: z
      .string()
      .trim()
      .min(2, "Description must be at least 2 characters")
      .max(5000, "Description cannot exceed 5000 characters")
      .optional(),
    status: z
      .enum([
        INCIDENT_STATUS.OPEN,
        INCIDENT_STATUS.IN_PROGRESS,
        INCIDENT_STATUS.RESOLVED,
        INCIDENT_STATUS.CLOSED,
      ])
      .optional(),
    priority: z
      .enum([
        INCIDENT_PRIORITY.LOW,
        INCIDENT_PRIORITY.MEDIUM,
        INCIDENT_PRIORITY.HIGH,
        INCIDENT_PRIORITY.CRITICAL,
      ])
      .optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.priority !== undefined,
    {
      message: "At least one valid field (title, description, status, priority) must be provided for update",
    }
  );

export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

/**
 * Schema for assigning or reassigning an incident.
 * Setting assigneeId to null unassigns the incident.
 */
export const updateAssigneeSchema = z
  .object({
    assigneeId: objectIdSchema.nullable(),
  })
  .strict();

export type UpdateAssigneeInput = z.infer<typeof updateAssigneeSchema>;

/**
 * Safe allowlist of fields available for sorting.
 */
export const ALLOWED_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "title",
  "priority",
  "status",
] as const;

/**
 * Schema for listing, paginating, searching, and filtering incidents.
 */
export const listIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z
    .enum([
      INCIDENT_STATUS.OPEN,
      INCIDENT_STATUS.IN_PROGRESS,
      INCIDENT_STATUS.RESOLVED,
      INCIDENT_STATUS.CLOSED,
    ])
    .optional(),
  priority: z
    .enum([
      INCIDENT_PRIORITY.LOW,
      INCIDENT_PRIORITY.MEDIUM,
      INCIDENT_PRIORITY.HIGH,
      INCIDENT_PRIORITY.CRITICAL,
    ])
    .optional(),
  assigneeId: objectIdSchema.optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(ALLOWED_SORT_FIELDS).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListIncidentsQueryInput = z.infer<typeof listIncidentsQuerySchema>;

/**
 * Schema for validating incidentId in URL parameters.
 */
export const incidentIdParamSchema = z.object({
  incidentId: objectIdSchema,
});

export type IncidentIdParamInput = z.infer<typeof incidentIdParamSchema>;
