import { z } from "zod";
import { ROLES } from "@/types";

export const ALLOWED_INVITATION_ROLES = [
  ROLES.ADMIN,
  ROLES.MANAGER,
  ROLES.DEVELOPER,
] as const;

export type AllowedInvitationRole = (typeof ALLOWED_INVITATION_ROLES)[number];

export const invitationFormSchema = z.object({
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

export type InvitationFormValues = z.infer<typeof invitationFormSchema>;

