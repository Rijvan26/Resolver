import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  IncidentAiStatus,
  AiSuggestion,
  AiUserDecision,
  AiTriageOutput,
  AiSummaryOutput,
  AiPostmortemOutput,
} from "@/types";

export interface TriggerTriagePayload {
  incidentId: string;
  alert?: {
    title?: string;
    description?: string;
    type?: string;
    errorRate?: number;
    latencyP99Ms?: number;
  };
}

export interface RecordDecisionPayload {
  suggestionId: string;
  incidentId: string;
  decision: AiUserDecision;
  editedOutput?: Record<string, unknown>;
}

export const aiApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getIncidentAiStatus: builder.query<ApiSuccessResponse<IncidentAiStatus>, string>({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}/ai`,
        method: "GET",
      }),
      providesTags: (_result, _error, incidentId) => [
        { type: "IncidentAi", id: incidentId },
      ],
    }),

    triggerTriage: builder.mutation<
      ApiSuccessResponse<AiSuggestion<AiTriageOutput> | null>,
      TriggerTriagePayload
    >({
      query: ({ incidentId, alert }) => ({
        url: `/incidents/${incidentId}/ai/triage`,
        method: "POST",
        body: alert ? { alert } : {},
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "IncidentAi", id: incidentId },
        { type: "IncidentDetails", id: incidentId },
      ],
    }),

    triggerSummary: builder.mutation<
      ApiSuccessResponse<AiSuggestion<AiSummaryOutput> | null>,
      string
    >({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}/ai/summary`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, incidentId) => [
        { type: "IncidentAi", id: incidentId },
        { type: "IncidentDetails", id: incidentId },
      ],
    }),

    triggerPostmortem: builder.mutation<
      ApiSuccessResponse<AiSuggestion<AiPostmortemOutput> | null>,
      string
    >({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}/ai/postmortem`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, incidentId) => [
        { type: "IncidentAi", id: incidentId },
      ],
    }),

    recordDecision: builder.mutation<
      ApiSuccessResponse<AiSuggestion>,
      RecordDecisionPayload
    >({
      query: ({ suggestionId, decision, editedOutput }) => ({
        url: `/ai/suggestions/${suggestionId}/decision`,
        method: "POST",
        body: { decision, ...(editedOutput ? { editedOutput } : {}) },
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "IncidentAi", id: incidentId },
        { type: "IncidentDetails", id: incidentId },
        { type: "Incidents", id: incidentId },
        { type: "Incidents", id: "LIST" },
        "Dashboard",
      ],
    }),
  }),
});

export const {
  useGetIncidentAiStatusQuery,
  useTriggerTriageMutation,
  useTriggerSummaryMutation,
  useTriggerPostmortemMutation,
  useRecordDecisionMutation,
} = aiApi;

