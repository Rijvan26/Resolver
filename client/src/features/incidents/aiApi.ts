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
  decision: AiUserDecision | "link";
  targetIncidentId?: string;
  editedOutput?: Record<string, unknown>;
}

export interface SimilarIncidentItem {
  incidentId: string;
  title: string;
  service: string | null;
  finalSeverity: string | null;
  resolutionNotes: string | null;
  similarityScore: number;
  link: string;
}

export interface SimilarIncidentsResponse {
  available: boolean;
  reason?: string;
  similarIncidents: SimilarIncidentItem[];
}

export interface ClarifyReportPayload {
  title: string;
  description: string;
  serviceId?: string | null;
}

export interface ClarifyReportResponse {
  vague: boolean;
  questions: string[];
  reason?: string | null;
}

export interface TriggerStatusDraftPayload {
  incidentId: string;
  audience: "internal" | "customer";
}

export interface AiStatusDraftOutput {
  audience: "internal" | "customer";
  draftText: string;
  summary?: string | null;
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

    getSimilarIncidents: builder.query<
      ApiSuccessResponse<SimilarIncidentsResponse>,
      string
    >({
      query: (incidentId) => ({
        url: `/incidents/${incidentId}/ai/similar`,
        method: "GET",
      }),
      providesTags: (_result, _error, incidentId) => [
        { type: "IncidentAi", id: `similar-${incidentId}` },
      ],
    }),

    clarifyReport: builder.mutation<
      ApiSuccessResponse<ClarifyReportResponse>,
      ClarifyReportPayload
    >({
      query: (body) => ({
        url: "/reports/ai/clarify",
        method: "POST",
        body,
      }),
    }),

    triggerStatusDraft: builder.mutation<
      ApiSuccessResponse<AiSuggestion<AiStatusDraftOutput> | null>,
      TriggerStatusDraftPayload
    >({
      query: ({ incidentId, audience }) => ({
        url: `/incidents/${incidentId}/ai/status-draft`,
        method: "POST",
        body: { audience },
      }),
      invalidatesTags: (_result, _error, { incidentId }) => [
        { type: "IncidentAi", id: incidentId },
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
  useGetSimilarIncidentsQuery,
  useClarifyReportMutation,
  useTriggerStatusDraftMutation,
} = aiApi;

