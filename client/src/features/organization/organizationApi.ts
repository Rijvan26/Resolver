import { api } from "@/services/api";
import { ApiSuccessResponse, Organization, OrganizationAiSettings } from "@/types";

export interface UpdateOrganizationPayload {
  name?: string;
  statusPageEnabled?: boolean;
  aiSettings?: Partial<OrganizationAiSettings>;
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
  }),
});

export const {
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
} = organizationApi;

