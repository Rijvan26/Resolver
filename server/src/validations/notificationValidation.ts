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
 * Schema for listing notifications with pagination and unread filter.
 */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, "Page must be greater than or equal to 1").default(1),
  limit: z.coerce.number().int().min(1, "Limit must be at least 1").max(100, "Limit cannot exceed 100").default(20),
  unread: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .transform((val) => {
      if (val === undefined) return undefined;
      if (typeof val === "boolean") return val;
      return val === "true";
    }),
});

export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;

/**
 * Schema for validating notificationId in URL route parameters.
 */
export const notificationIdParamSchema = z
  .object({
    notificationId: objectIdSchema,
  })
  .strict();

export type NotificationIdParamInput = z.infer<typeof notificationIdParamSchema>;

