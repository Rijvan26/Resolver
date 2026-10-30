import { z } from "zod";
import { INCIDENT_STATUS, INCIDENT_PRIORITY, IncidentStatus, IncidentPriority } from "@/types";

export const incidentFormSchema = z.object({
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
  status: z.enum([
    INCIDENT_STATUS.OPEN,
    INCIDENT_STATUS.IN_PROGRESS,
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.CLOSED,
  ] as [IncidentStatus, ...IncidentStatus[]]),
  priority: z.enum([
    INCIDENT_PRIORITY.LOW,
    INCIDENT_PRIORITY.MEDIUM,
    INCIDENT_PRIORITY.HIGH,
    INCIDENT_PRIORITY.CRITICAL,
  ] as [IncidentPriority, ...IncidentPriority[]]),
  assigneeId: z.string().optional(),
});

export type IncidentFormValues = z.infer<typeof incidentFormSchema>;

export const updateIncidentFormSchema = z.object({
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
  status: z.enum([
    INCIDENT_STATUS.OPEN,
    INCIDENT_STATUS.IN_PROGRESS,
    INCIDENT_STATUS.RESOLVED,
    INCIDENT_STATUS.CLOSED,
  ] as [IncidentStatus, ...IncidentStatus[]]),
  priority: z.enum([
    INCIDENT_PRIORITY.LOW,
    INCIDENT_PRIORITY.MEDIUM,
    INCIDENT_PRIORITY.HIGH,
    INCIDENT_PRIORITY.CRITICAL,
  ] as [IncidentPriority, ...IncidentPriority[]]),
});

export type UpdateIncidentFormValues = z.infer<typeof updateIncidentFormSchema>;

export const commentFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Comment content cannot be empty")
    .max(5000, "Comment cannot exceed 5000 characters"),
});

export type CommentFormValues = z.infer<typeof commentFormSchema>;


