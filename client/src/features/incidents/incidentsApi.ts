import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  Incident,
  PaginatedIncidents,
  ListIncidentsParams,
  CreateIncidentPayload,
  UpdateIncidentPayload,
  UpdateAssigneePayload,
  IncidentAlertsData,
} from "@/types";

export const incidentsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listIncidents: builder.query<ApiSuccessResponse<PaginatedIncidents>, ListIncidentsParams | void>({
      query: (params) => ({
        url: "/incidents",
        method: "GET",
        params: params || {},
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.data.incidents.map(({ id }) => ({ type: "Incidents" as const, id })),
              { type: "Incidents", id: "LIST" },
            ]
          : [{ type: "Incidents", id: "LIST" }],
    }),

    getIncident: builder.query<ApiSuccessResponse<Incident>, string>({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [
        { type: "IncidentDetails", id },
        { type: "Incidents", id },
      ],
    }),

    createIncident: builder.mutation<ApiSuccessResponse<Incident>, CreateIncidentPayload>({
      query: (body) => ({
        url: "/incidents",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Incidents", id: "LIST" }, "Dashboard"],
    }),

    updateIncident: builder.mutation<
      ApiSuccessResponse<Incident>,
      { id: string; data: UpdateIncidentPayload }
    >({
      query: ({ id, data }) => ({
        url: `/incidents/${id}`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Incidents", id },
        { type: "Incidents", id: "LIST" },
        { type: "IncidentDetails", id },
        { type: "Timeline", id },
        "Dashboard",
      ],
    }),

    updateAssignee: builder.mutation<
      ApiSuccessResponse<Incident>,
      { id: string; data: UpdateAssigneePayload }
    >({
      query: ({ id, data }) => ({
        url: `/incidents/${id}/assignee`,
        method: "PATCH",
        body: data,
      }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: "Incidents", id },
        { type: "Incidents", id: "LIST" },
        { type: "IncidentDetails", id },
        { type: "Timeline", id },
        "Dashboard",
      ],
    }),

    deleteIncident: builder.mutation<ApiSuccessResponse<null>, string>({
      query: (id) => ({
        url: `/incidents/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Incidents", id },
        { type: "Incidents", id: "LIST" },
        { type: "IncidentDetails", id },
        "Dashboard",
      ],
    }),

    getIncidentAlerts: builder.query<ApiSuccessResponse<IncidentAlertsData>, string>({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}/alerts`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [{ type: "IncidentAlerts", id }],
    }),

    recordAlertDecision: builder.mutation<
      ApiSuccessResponse<unknown>,
      { incidentId: string; alertId: string; decision: "accept" | "dismiss" }
    >({
      query: ({ incidentId, alertId, decision }) => ({
        url: `/incidents/${incidentId}/alerts/${alertId}/decision`,
        method: "POST",
        body: { decision },
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "IncidentAlerts", id: incidentId },
        { type: "IncidentDetails", id: incidentId },
        { type: "Incidents", id: incidentId },
        { type: "Incidents", id: "LIST" },
        { type: "Timeline", id: incidentId },
        "Dashboard",
      ],
    }),
  }),
});

export const {
  useListIncidentsQuery,
  useGetIncidentQuery,
  useCreateIncidentMutation,
  useUpdateIncidentMutation,
  useUpdateAssigneeMutation,
  useDeleteIncidentMutation,
  useGetIncidentAlertsQuery,
  useRecordAlertDecisionMutation,
} = incidentsApi;

