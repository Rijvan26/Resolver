import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  PaginatedMembers,
  Member,
  Role,
} from "@/types";

export interface ListMembersParams {
  page?: number;
  limit?: number;
  role?: Role;
  status?: "active" | "deactivated";
  search?: string;
}

export interface UpdateMemberRolePayload {
  memberId: string;
  role: Role;
}

export interface UpdateMemberStatusPayload {
  memberId: string;
  isActive: boolean;
}

export const membersApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getMembers: builder.query<ApiSuccessResponse<PaginatedMembers>, ListMembersParams | void>({
      query: (params) => ({
        url: "/organizations/me/members",
        method: "GET",
        params: params || {},
      }),
      providesTags: (result) =>
        result?.data?.members
          ? [
              ...result.data.members.map(({ id }) => ({ type: "Members" as const, id })),
              { type: "Members", id: "LIST" },
            ]
          : [{ type: "Members", id: "LIST" }],
    }),

    getMember: builder.query<ApiSuccessResponse<Member>, string>({
      query: (memberId) => ({
        url: `/organizations/me/members/${memberId}`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [{ type: "Members", id }],
    }),

    updateMemberRole: builder.mutation<ApiSuccessResponse<Member>, UpdateMemberRolePayload>({
      query: ({ memberId, role }) => ({
        url: `/organizations/me/members/${memberId}/role`,
        method: "PATCH",
        body: { role },
      }),
      invalidatesTags: (_result, _error, { memberId }) => [
        { type: "Members", id: memberId },
        { type: "Members", id: "LIST" },
        "Dashboard",
      ],
    }),

    updateMemberStatus: builder.mutation<ApiSuccessResponse<Member>, UpdateMemberStatusPayload>({
      query: ({ memberId, isActive }) => ({
        url: `/organizations/me/members/${memberId}/status`,
        method: "PATCH",
        body: { isActive },
      }),
      invalidatesTags: (_result, _error, { memberId }) => [
        { type: "Members", id: memberId },
        { type: "Members", id: "LIST" },
        "Dashboard",
      ],
    }),
  }),
});

export const {
  useGetMembersQuery,
  useGetMemberQuery,
  useUpdateMemberRoleMutation,
  useUpdateMemberStatusMutation,
} = membersApi;
