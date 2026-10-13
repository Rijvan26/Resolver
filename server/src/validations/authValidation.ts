import { z } from "zod";

/**
 * Organization Registration Validation Schema
 */
export const registerOrganizationSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name cannot exceed 100 characters"),
  creatorName: z
    .string()
    .trim()
    .min(2, "Creator name must be at least 2 characters")
    .max(100, "Creator name cannot exceed 100 characters")
    .optional(),
  name: z
    .string()
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters")
    .optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required")
    .max(255, "Email address cannot exceed 255 characters"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password cannot exceed 128 characters"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must consist of lowercase alphanumeric characters and single hyphens"
    )
    .max(120, "Slug cannot exceed 120 characters")
    .optional(),
}).refine((data) => data.creatorName || data.name, {
  message: "Creator name is required (use 'creatorName' or 'name')",
  path: ["creatorName"],
});

export type RegisterOrganizationInput = z.infer<typeof registerOrganizationSchema>;

/**
 * User Login Validation Schema
 */
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email address is required"),
  password: z
    .string()
    .min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Refresh Token Validation Schema (payload or cookie fallback)
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
