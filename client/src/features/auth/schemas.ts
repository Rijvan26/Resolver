import { z } from "zod";

/**
 * Login validation schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Please enter a valid email address")
    .toLowerCase(),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/**
 * Organization registration validation schema
 */
export const registerOrgSchema = z
  .object({
    organizationName: z
      .string()
      .trim()
      .min(2, "Organization name must be at least 2 characters")
      .max(100, "Organization name cannot exceed 100 characters"),
    creatorName: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name cannot exceed 100 characters"),
    email: z
      .string()
      .trim()
      .min(1, "Work email is required")
      .email("Please enter a valid work email address")
      .max(255, "Email cannot exceed 255 characters")
      .toLowerCase(),
    slug: z
      .string()
      .trim()
      .max(120, "Slug cannot exceed 120 characters")
      .optional()
      .refine(
        (val) => !val || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(val),
        { message: "Slug must consist of lowercase alphanumeric characters and hyphens (e.g., 'acme-corp')" }
      ),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password cannot exceed 128 characters"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterOrgFormValues = z.infer<typeof registerOrgSchema>;

/**
 * Invitation acceptance validation schema
 */
export const acceptInvitationSchema = z
  .object({
    token: z
      .string()
      .trim()
      .min(1, "Invitation token is required"),
    name: z
      .string()
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(100, "Full name cannot exceed 100 characters"),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password cannot exceed 128 characters"),
    confirmPassword: z
      .string()
      .min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationSchema>;

