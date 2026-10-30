import React, { useEffect, useState } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  setAccessToken,
  setUserAndOrganization,
  setInitialized,
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
    // If already initialized (e.g. after login/registration), skip session restoration
    if (isInitialized) {
      setIsRestoring(false);
      return;
    }

    let isMounted = true;

    const restoreSession = async () => {
      try {
        // Attempt silent session restoration using the HttpOnly signed cookie
        const refreshRes = await fetch(
          `${import.meta.env.VITE_API_URL || "/api/v1"}/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
          }
        );

        if (!refreshRes.ok) {
          // No active session or cookie expired
          if (isMounted) {
            dispatch(setInitialized(true));
            setIsRestoring(false);
          }
          return;
        }

        const refreshData = await refreshRes.json();
        const newAccessToken = refreshData?.data?.accessToken;

        if (newAccessToken && isMounted) {
          dispatch(setAccessToken(newAccessToken));

          // Fetch current user and organization profile with the verified access token
          const meResult = await lazyGetMe().unwrap();
          if (isMounted && meResult.success && meResult.data) {
            dispatch(setUserAndOrganization(meResult.data));
          }
        }
      } catch {
        // Silent failure: user simply remains unauthenticated
      } finally {
        if (isMounted) {
          dispatch(setInitialized(true));
          setIsRestoring(false);
        }
      }
    };

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, [dispatch, isInitialized, lazyGetMe]);

  // Apply theme class to <html>
  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else if (theme === "light") {
      document.documentElement.classList.remove("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      if (prefersDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [theme]);

  // Show full-page splash loader only during initial cold startup check
  if (isRestoring && !isInitialized && !accessToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Connecting to Resolver...
          </p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
};

export default App;
