import { z } from "zod";
import { ACTIVITY_ACTION, ActivityAction } from "../types";

const activityActionValues = Object.values(ACTIVITY_ACTION) as [
  ActivityAction,
  ...ActivityAction[]
];

/**
 * Schema for querying the incident activity / audit timeline.
 */
export const listTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  action: z.enum(activityActionValues).optional(),
});

export type ListTimelineQueryInput = z.infer<typeof listTimelineQuerySchema>;
