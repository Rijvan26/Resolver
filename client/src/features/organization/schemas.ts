import { z } from "zod";

export const updateOrganizationFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Organization name must be at least 2 characters")
    .max(100, "Organization name cannot exceed 100 characters"),
  statusPageEnabled: z.boolean(),
  aiSettings: z
    .object({
      alertGrouping: z.boolean(),
      runbooks: z.boolean(),
      assistant: z.boolean(),
      alertGroupingWindowMinutes: z.number().int().min(1).max(1440),
      alertGroupingSimilarityThreshold: z.number().min(0).max(1),
    })
    .optional(),
});

export type UpdateOrganizationFormValues = z.infer<typeof updateOrganizationFormSchema>;

