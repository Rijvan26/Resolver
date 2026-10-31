import { z } from "zod";

export const updateOrganizationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name cannot exceed 100 characters"),
  statusPageEnabled: z.boolean(),
});

export type UpdateOrganizationFormValues = z.infer<typeof updateOrganizationFormSchema>;

