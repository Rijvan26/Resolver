import { api } from "@/services/api";
import { ApiSuccessResponse, Organization } from "@/types";

export interface UpdateOrganizationPayload {
  name?: string;
  statusPageEnabled?: boolean;
}

export const organizationApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getOrganization: builder.query<ApiSuccessResponse<Organization>, void>({
      query: () => ({
        url: "/organizations/me",
        method: "GET",
      }),
      providesTags: ["Organization"],
    }),

    updateOrganization: builder.mutation<
      ApiSuccessResponse<Organization>,
      UpdateOrganizationPayload
    >({
      query: (body) => ({
        url: "/organizations/me",
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

