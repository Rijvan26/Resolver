import {
  fetchBaseQuery,
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
} from "@reduxjs/toolkit/query";
import { setAccessToken, logoutState } from "@/features/auth/authSlice";
import type { RootState } from "@/app/store";
import { ApiSuccessResponse } from "@/types";

const baseQuery = fetchBaseQuery({
  baseUrl: import.meta.env.VITE_API_URL || "/api/v1",
  credentials: "include", // Essential for HttpOnly signed refreshToken cookies
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as RootState).auth.accessToken;
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return headers;
  },
});

// Mutex lock to prevent multiple simultaneous refresh token requests
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export const baseQueryWithReauth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);

  if (result.error && result.error.status === 401) {
    // If the original request was an auth action, do not attempt automatic token refresh
    const url = typeof args === "string" ? args : args.url;
    if (
      url.includes("/auth/login") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/register-organization") ||
      url.includes("/invitations/accept")
    ) {
      return result;
    }

    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = (async () => {
        try {
          const savedRefreshToken =
            typeof window !== "undefined"
              ? localStorage.getItem("resolver_refresh_token")
              : null;

          const refreshResult = await baseQuery(
            {
              url: "/auth/refresh",
              method: "POST",
              body: savedRefreshToken ? { refreshToken: savedRefreshToken } : {},
            },
            api,
            extraOptions
          );

          if (refreshResult.data) {
            const data = (refreshResult.data as ApiSuccessResponse<{
              accessToken: string;
              refreshToken: string;
            }>).data;

            if (data?.accessToken) {
              api.dispatch(setAccessToken(data.accessToken));
              if (data.refreshToken && typeof window !== "undefined") {
                localStorage.setItem("resolver_refresh_token", data.refreshToken);
              }
              return data.accessToken;
            }
          }
          api.dispatch(logoutState());
          return null;
        } catch {
          api.dispatch(logoutState());
          return null;
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      })();
    }

    const newAccessToken = await refreshPromise;

    if (newAccessToken) {
      // Retry original request with newly refreshed token
      result = await baseQuery(args, api, extraOptions);
    } else {
      api.dispatch(logoutState());
    }
  }

  return result;
};
