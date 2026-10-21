import { z } from "zod";
import { Types } from "mongoose";

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
 * Schema for creating a comment on an incident.
 * Author and organization are extracted strictly from server context.
 */
export const createCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty")
      .max(5000, "Comment content cannot exceed 5000 characters"),
  })
  .strict();

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

/**
 * Schema for updating an existing comment.
 */
export const updateCommentSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Comment content cannot be empty")
      .max(5000, "Comment content cannot exceed 5000 characters"),
  })
  .strict();

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;

/**
 * Schema for validating URL parameters containing incidentId and commentId.
 */
export const commentParamsSchema = z.object({
  incidentId: objectIdSchema,
  commentId: objectIdSchema,
});

export type CommentParamsInput = z.infer<typeof commentParamsSchema>;

/**
 * Schema for validating URL parameters with incidentId only.
 */
export const incidentOnlyParamSchema = z.object({
  incidentId: objectIdSchema,
});

export type IncidentOnlyParamInput = z.infer<typeof incidentOnlyParamSchema>;

/**
 * Schema for querying comments with pagination.
 */
export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

export type ListCommentsQueryInput = z.infer<typeof listCommentsQuerySchema>;
