import { api } from "@/services/api";
import { ApiSuccessResponse, PaginatedMembers, Role } from "@/types";

export interface ListMembersParams {
  page?: number;
  limit?: number;
  role?: Role;
  status?: "active" | "deactivated";
  search?: string;
}

export const membersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMembers: builder.query<ApiSuccessResponse<PaginatedMembers>, ListMembersParams | void>({
      query: (params) => ({
        url: "/organizations/me/members",
        method: "GET",
        params: params || {},
      }),
      providesTags: ["Members"],
    }),
  }),
});

export const { useGetMembersQuery } = membersApi;

