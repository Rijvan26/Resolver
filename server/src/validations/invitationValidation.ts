import { z } from "zod";
import { ROLES } from "../types";

/**
 * Roles that are permitted to be invited into an organization.
 * SUPER_ADMIN is explicitly excluded as it can only be initialized at organization creation.
 */
export const ALLOWED_INVITATION_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.DEVELOPER,
] as const;

export type AllowedInvitationRole = (typeof ALLOWED_INVITATION_ROLES)[number];

/**
 * Schema for creating a new member invitation.
 */
export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required")
    .max(255, "Email address cannot exceed 255 characters"),
  role: z.enum(ALLOWED_INVITATION_ROLES, {
    message: "Invited role must be ADMIN, MANAGER, or DEVELOPER",
  }),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

/**
 * Schema for accepting an invitation and completing member onboarding.
 */
export const acceptInvitationSchema = z.object({
  token: z
    .string()
    .trim()
    .min(1, "Invitation token is required"),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password cannot exceed 128 characters"),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
