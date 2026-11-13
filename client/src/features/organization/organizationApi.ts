import { api } from "@/services/api";
import { ApiSuccessResponse, Organization, OrganizationAiSettings } from "@/types";

export interface UpdateOrganizationPayload {
  name?: string;
  statusPageEnabled?: boolean;
  aiSettings?: Partial<OrganizationAiSettings>;
}

export interface DeleteOrganizationPreview {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  counts: {
    members: number;
    incidents: number;
    services: number;
    alerts: number;
    comments: number;
    activities: number;
    invitations: number;
    notifications: number;
    runbooks: number;
    aiSuggestions: number;
    incidentEmbeddings: number;
    refreshTokens: number;
  };
  totalRecords: number;
}

export interface DeleteOrganizationPayload {
  id?: string;
  organizationName: string;
  password: string;
}

export const organizationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOrganization: builder.query<ApiSuccessResponse<Organization>, void>({
      query: () => ({
        url: "/settings",
        method: "GET",
      }),
      providesTags: ["Organization"],
    }),

    updateOrganization: builder.mutation<
      ApiSuccessResponse<Organization>,
      UpdateOrganizationPayload
    >({
      query: (body) => ({
        url: "/settings",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Organization", "Auth"],
    }),

    getDeletePreview: builder.query<ApiSuccessResponse<DeleteOrganizationPreview>, string | void>({
      query: (id) => ({
        url: `/organizations/${id || "me"}/delete-preview`,
        method: "GET",
      }),
      providesTags: ["Organization"],
    }),

    deleteOrganization: builder.mutation<
      ApiSuccessResponse<{ message: string; auditId: string; totalRecordsDeleted: number }>,
      DeleteOrganizationPayload
    >({
      query: ({ id, ...body }) => ({
        url: `/organizations/${id || "me"}`,
        method: "DELETE",
        body,
      }),
      invalidatesTags: [
        "Organization",
        "Auth",
        "Incidents",
        "Members",
        "Invitations",
        "Notifications",
        "Dashboard",
      ],
    }),
  }),
});

export const {
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
  useGetDeletePreviewQuery,
  useLazyGetDeletePreviewQuery,
  useDeleteOrganizationMutation,
} = organizationApi;

