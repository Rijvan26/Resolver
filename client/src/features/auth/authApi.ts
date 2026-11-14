import { api } from "@/services/api";
import {
  ApiSuccessResponse,
  User,
  Organization,
} from "@/types";
import { setCredentials, setUserAndOrganization, logoutState, setUserHasPassword } from "./authSlice";

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

export interface GoogleWorkspaceSetupData {
  requiresWorkspaceSetup: true;
  setupToken: string;
  suggestedOrgName: string;
  suggestedSlug: string;
  user: {
    name: string;
    email: string;
    avatarUrl?: string;
  };
}

export type GoogleAuthResponseData = LoginResponseData | GoogleWorkspaceSetupData;

export interface GoogleAuthRequest {
  idToken: string;
  organizationName?: string;
  slug?: string;
  invitationToken?: string;
}

export interface CompleteGoogleSetupRequest {
  setupToken: string;
  organizationName: string;
  slug: string;
}

export interface SetPasswordRequest {
  currentPassword?: string;
  newPassword: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
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
                refreshToken: data.data.refreshToken,
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

    googleAuth: builder.mutation<ApiSuccessResponse<GoogleAuthResponseData>, GoogleAuthRequest>({
      query: (body) => ({
        url: "/auth/google",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard", "Incidents", "Members", "Notifications"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.success && data.data && !("requiresWorkspaceSetup" in data.data)) {
            dispatch(
              setCredentials({
                accessToken: data.data.accessToken,
                refreshToken: data.data.refreshToken,
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

    completeGoogleSetup: builder.mutation<
      ApiSuccessResponse<LoginResponseData>,
      CompleteGoogleSetupRequest
    >({
      query: (body) => ({
        url: "/auth/google/complete-setup",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Dashboard", "Incidents", "Members", "Notifications"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.success && data.data) {
            dispatch(
              setCredentials({
                accessToken: data.data.accessToken,
                refreshToken: data.data.refreshToken,
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

    setPassword: builder.mutation<
      ApiSuccessResponse<{ message: string; hasPassword: boolean }>,
      SetPasswordRequest
    >({
      query: (body) => ({
        url: "/auth/set-password",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
      async onQueryStarted(_, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          if (data.success) {
            dispatch(setUserHasPassword(true));
          }
        } catch {
          // Handled by calling component
        }
      },
    }),

    forgotPassword: builder.mutation<
      ApiSuccessResponse<{ message: string }>,
      ForgotPasswordRequest
    >({
      query: (body) => ({
        url: "/auth/forgot-password",
        method: "POST",
        body,
      }),
    }),

    resetPassword: builder.mutation<
      ApiSuccessResponse<{ message: string }>,
      ResetPasswordRequest
    >({
      query: (body) => ({
        url: "/auth/reset-password",
        method: "POST",
        body,
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
  useGoogleAuthMutation,
  useCompleteGoogleSetupMutation,
  useRegisterOrganizationMutation,
  useAcceptInvitationMutation,
  useGetMeQuery,
  useLazyGetMeQuery,
  useRefreshSessionMutation,
  useSetPasswordMutation,
  useForgotPasswordMutation,
  useResetPasswordMutation,
  useLogoutMutation,
} = authApi;
