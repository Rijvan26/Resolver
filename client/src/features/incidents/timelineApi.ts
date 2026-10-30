import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  PaginatedTimeline,
  ActivityAction,
} from "@/types";

export interface ListTimelineParams {
  incidentId: string;
  page?: number;
  limit?: number;
  sortOrder?: "asc" | "desc";
  action?: ActivityAction;
}

export const timelineApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getIncidentTimeline: builder.query<ApiSuccessResponse<PaginatedTimeline>, ListTimelineParams>({
      query: ({ incidentId, page = 1, limit = 20, sortOrder = "desc", action }) => {
        const params: Record<string, unknown> = { page, limit, sortOrder };
        if (action) {
          params.action = action;
        }
        return {
          url: `/incidents/${incidentId}/timeline`,
          method: "GET",
          params,
        };
      },
      providesTags: (_result, _error, { incidentId }) => [
        { type: "Timeline", id: incidentId },
      ],
    }),
  }),
});

export const { useGetIncidentTimelineQuery } = timelineApi;

