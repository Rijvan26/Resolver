import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  Invitation,
  InvitationStatus,
  Role,
} from "@/types";

export interface ListInvitationsParams {
  status?: InvitationStatus;
}

export interface CreateInvitationPayload {
  email: string;
  role: Role;
}

export const invitationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listInvitations: builder.query<ApiSuccessResponse<Invitation[]>, ListInvitationsParams | void>({
      query: (params) => ({
        url: "/invitations",
        method: "GET",
        params: params || {},
      }),
      providesTags: (result) =>
        result?.data
          ? [
              ...result.data.map(({ id }) => ({ type: "Invitations" as const, id })),
              { type: "Invitations", id: "LIST" },
            ]
          : [{ type: "Invitations", id: "LIST" }],
    }),

    createInvitation: builder.mutation<ApiSuccessResponse<Invitation>, CreateInvitationPayload>({
      query: (body) => ({
        url: "/invitations",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Invitations", id: "LIST" }],
    }),

    revokeInvitation: builder.mutation<ApiSuccessResponse<Invitation>, string>({
      query: (invitationId) => ({
        url: `/invitations/${invitationId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Invitations", id },
        { type: "Invitations", id: "LIST" },
      ],
    }),

    resendInvitation: builder.mutation<ApiSuccessResponse<Invitation>, string>({
      query: (invitationId) => ({
        url: `/invitations/${invitationId}/resend`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, id) => [
        { type: "Invitations", id },
        { type: "Invitations", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useListInvitationsQuery,
  useCreateInvitationMutation,
  useRevokeInvitationMutation,
  useResendInvitationMutation,
} = invitationsApi;

