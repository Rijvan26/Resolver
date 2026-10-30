import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  OverviewStats,
  IncidentsByStatusData,
  IncidentsByPriorityData,
  IncidentTrendsData,
  TeamWorkloadData,
  PaginatedRecentActivity,
  DashboardDateRangeParams,
  RecentActivityParams,
} from "@/types";

export const dashboardApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOverview: builder.query<
      ApiSuccessResponse<OverviewStats>,
      DashboardDateRangeParams | void
    >({
      query: (params) => ({
        url: "/dashboard/overview",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Dashboard"],
    }),

    getIncidentsByStatus: builder.query<
      ApiSuccessResponse<IncidentsByStatusData>,
      DashboardDateRangeParams | void
    >({
      query: (params) => ({
        url: "/dashboard/incidents-by-status",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Dashboard"],
    }),

    getIncidentsByPriority: builder.query<
      ApiSuccessResponse<IncidentsByPriorityData>,
      DashboardDateRangeParams | void
    >({
      query: (params) => ({
        url: "/dashboard/incidents-by-priority",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Dashboard"],
    }),

    getIncidentTrends: builder.query<
      ApiSuccessResponse<IncidentTrendsData>,
      DashboardDateRangeParams | void
    >({
      query: (params) => ({
        url: "/dashboard/incident-trends",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Dashboard"],
    }),

    getTeamWorkload: builder.query<ApiSuccessResponse<TeamWorkloadData>, void>({
      query: () => ({
        url: "/dashboard/team-workload",
        method: "GET",
      }),
      providesTags: ["Dashboard", "Members"],
    }),

    getRecentActivity: builder.query<
      ApiSuccessResponse<PaginatedRecentActivity>,
      RecentActivityParams | void
    >({
      query: (params) => ({
        url: "/dashboard/recent-activity",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Dashboard"],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetIncidentsByStatusQuery,
  useGetIncidentsByPriorityQuery,
  useGetIncidentTrendsQuery,
  useGetTeamWorkloadQuery,
  useGetRecentActivityQuery,
} = dashboardApi;

