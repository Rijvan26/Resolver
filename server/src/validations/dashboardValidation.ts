import { z } from "zod";

const MAX_TREND_RANGE_DAYS = 90;

/**
 * Validates ISO date strings (e.g. YYYY-MM-DD or full ISO 8601).
 */
const dateStringSchema = z
  .string()
  .trim()
  .refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format. Expected valid ISO-8601 string (e.g. YYYY-MM-DD)",
  })
  .transform((val) => new Date(val));

/**
 * Date Range Query Schema for Overview, Distributions, and Trends.
 */
export const dateRangeQuerySchema = z
  .object({
    startDate: dateStringSchema.optional(),
    endDate: dateStringSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: "startDate cannot be after endDate",
      path: ["startDate"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const diffMs = data.endDate.getTime() - data.startDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        return diffDays <= MAX_TREND_RANGE_DAYS;
      }
      return true;
    },
    {
      message: `Date range cannot exceed ${MAX_TREND_RANGE_DAYS} days`,
      path: ["endDate"],
    }
  );

export type DateRangeQueryInput = z.infer<typeof dateRangeQuerySchema>;

/**
 * Recent Activity Query Schema.
 */
export const recentActivityQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type RecentActivityQueryInput = z.infer<typeof recentActivityQuerySchema>;

