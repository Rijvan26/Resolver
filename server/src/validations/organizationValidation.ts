import { z } from "zod";
import { Types } from "mongoose";
import { ROLES, Role } from "../types";

export const organizationAiSettingsSchema = z.object({
  alertGrouping: z.boolean().optional(),
  runbooks: z.boolean().optional(),
  assistant: z.boolean().optional(),
  alertGroupingWindowMinutes: z.number().int().min(1).max(1440).optional(),
  alertGroupingSimilarityThreshold: z.number().min(0).max(1).optional(),
});

export type OrganizationAiSettingsInput = z.infer<typeof organizationAiSettingsSchema>;

/**
 * Schema for updating organization settings.
 * Authorized fields: name, statusPageEnabled, aiSettings.
 * Unknown or unauthorized keys are strictly rejected.
 */
export const updateOrganizationSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters")
      .max(100, "Organization name cannot exceed 100 characters")
      .optional(),
    statusPageEnabled: z.boolean().optional(),
    aiSettings: organizationAiSettingsSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.name !== undefined ||
      data.statusPageEnabled !== undefined ||
      data.aiSettings !== undefined,
    {
      message: "At least one valid field (name, statusPageEnabled, or aiSettings) must be provided for update",
    }
  );

export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;

/**
 * Schema for querying and paginating organization members.
 */
export const listMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER]).optional(),
  status: z.enum(["active", "deactivated"]).optional(),
  search: z.string().trim().max(100).optional(),
});

export type ListMembersQueryInput = z.infer<typeof listMembersQuerySchema>;

/**
 * Schema for member ID URL parameter.
 */
export const memberIdParamSchema = z.object({
  memberId: z
    .string()
    .trim()
    .refine((val) => Types.ObjectId.isValid(val), {
      message: "Invalid member ID format: must be a valid ObjectId",
    }),
});

export type MemberIdParamInput = z.infer<typeof memberIdParamSchema>;

/**
 * Schema for updating a member's role.
 */
export const updateMemberRoleSchema = z
  .object({
    role: z.enum([ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER, ROLES.DEVELOPER], {
      message: "Invalid role specified. Must be SUPER_ADMIN, ADMIN, MANAGER, or DEVELOPER",
    }),
  })
  .strict();

export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

/**
 * Schema for updating a member's active status.
 */
export const updateMemberStatusSchema = z
  .object({
    isActive: z.boolean({
      message: "isActive boolean is required",
    }),
  })
  .strict();

export type UpdateMemberStatusInput = z.infer<typeof updateMemberStatusSchema>;
