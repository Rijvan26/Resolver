import React, { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  setAccessToken,
  setUserAndOrganization,
  setInitialized,
  logoutState,
} from "@/features/auth/authSlice";
import { useLazyGetMeQuery } from "@/features/auth/authApi";
import { Spinner } from "@/components/ui/spinner";

export const App: React.FC = () => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);
  const { isInitialized, accessToken } = useAppSelector((state) => state.auth);
  const [lazyGetMe] = useLazyGetMeQuery();
  const [isRestoring, setIsRestoring] = useState(!isInitialized);

  useEffect(() => {
    // If we already have a restored access token and initialization from storage, stop loading
    if (accessToken && isInitialized) {
      setIsRestoring(false);
      return;
    }

    let isMounted = true;

    const restoreSession = async () => {
      try {
        const savedRefreshToken =
          typeof window !== "undefined"
            ? localStorage.getItem("resolver_refresh_token")
            : null;

        // Attempt silent session restoration using the HttpOnly signed cookie or saved token
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || "/api/v1"}/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              savedRefreshToken ? { refreshToken: savedRefreshToken } : {}
            ),
            credentials: "include",
          }
        );

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          const newAccessToken = refreshData?.data?.accessToken;
          const newRefreshToken = refreshData?.data?.refreshToken;

          if (newAccessToken && isMounted) {
            dispatch(setAccessToken(newAccessToken));
            if (newRefreshToken && typeof window !== "undefined") {
              localStorage.setItem("resolver_refresh_token", newRefreshToken);
            }

            // Fetch current user and organization profile with the verified access token
            const meResult = await lazyGetMe().unwrap();
            if (isMounted && meResult.success && meResult.data) {
              dispatch(setUserAndOrganization(meResult.data));
            }
          }
        } else {
          // If refresh failed and no access token, mark unauthenticated cleanly
          if (isMounted && !accessToken) {
            dispatch(logoutState());
          }
        }
      } catch {
        // Silent failure: keep existing offline state
      } finally {
        if (isMounted) {
          dispatch(setInitialized(true));
          setIsRestoring(false);
        }
      }
    };

    restoreSession();
  }, [dispatch, isInitialized, accessToken, lazyGetMe]);

  // Synchronize root HTML theme class with reactive theme preference
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  // Initial session restoration loading screen
  if (isRestoring && !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pill">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-muted-fg">
            Restoring session...
          </p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
};

export default App;
