import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  User,
  Organization,
} from "@/types";
import { setCredentials, setUserAndOrganization, logoutState } from "./authSlice";

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponseData {
  accessToken: string;
  refreshToken: string;
  user: User;
  organization: Organization;
}

export interface RegisterOrgRequest {
  organizationName: string;
  creatorName: string;
  email: string;
  password: string;
  slug?: string;
}

export interface AcceptInvitationRequest {
  token: string;
  name: string;
  password: string;
}

export interface GetMeResponseData {
  user: User;
  organization: Organization;
}

export const authApi = api.injectEndpoints({
  endpoints: (builder) => ({
    login: builder.mutation<ApiSuccessResponse<LoginResponseData>, LoginRequest>({
      query: (credentials) => ({
        url: "/auth/login",
        method: "POST",
        body: credentials,
      }),
      invalidatesTags: ["Dashboard", "Incidents", "Members", "Notifications"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.success && data.data) {
            dispatch(
              setCredentials({
                accessToken: data.data.accessToken,
                user: data.data.user,
                organization: data.data.organization,
              })
            );
          }
        } catch {
          // Handled by calling component
        }
      },
    }),

    registerOrganization: builder.mutation<
      ApiSuccessResponse<{ user: User; organization: Organization }>,
      RegisterOrgRequest
    >({
      query: (body) => ({
        url: "/auth/register-organization",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard", "Incidents", "Members", "Notifications"],
    }),

    acceptInvitation: builder.mutation<
      ApiSuccessResponse<{ user: User; organization: Organization }>,
      AcceptInvitationRequest
    >({
      query: (body) => ({
        url: "/invitations/accept",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard", "Members"],
    }),

    getMe: builder.query<ApiSuccessResponse<GetMeResponseData>, void>({
      query: () => ({
        url: "/auth/me",
        method: "GET",
      }),
      providesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.success && data.data) {
            dispatch(setUserAndOrganization(data.data));
          }
        } catch {
          // Handled gracefully without forced logout
        }
      },
    }),

    refreshSession: builder.mutation<
      ApiSuccessResponse<{ accessToken: string; refreshToken: string }>,
      void
    >({
      query: () => ({
        url: "/auth/refresh",
        method: "POST",
      }),
    }),

    logout: builder.mutation<ApiSuccessResponse<null>, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
      invalidatesTags: ["Auth", "Dashboard", "Incidents", "Members", "Notifications"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
        } finally {
          dispatch(logoutState());
          dispatch(api.util.resetApiState());
        }
      },
    }),
  }),
});

export const {
  useLoginMutation,
  useRegisterOrganizationMutation,
  useAcceptInvitationMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useRefreshSessionMutation,
  useLogoutMutation,
} = authApi;
