import { createBrowserRouter, Navigate } from "react-router-dom";
import React, { lazy, Suspense } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/shared/ProtectedRoute";
import { Spinner } from "@/components/ui/spinner";
import { useGetUnreadNotificationCountQuery } from "@/features/notifications/notificationsApi";
import { useAppSelector } from "./hooks";

import { DashboardPage } from "@/pages/dashboard/DashboardPage";

// Lazy-loaded pages
const LoginPage = lazy(() => import("@/pages/auth/LoginPage"));
const RegisterOrgPage = lazy(() => import("@/pages/auth/RegisterOrgPage"));
const SetupWorkspacePage = lazy(() => import("@/pages/auth/SetupWorkspacePage"));
const ForgotPasswordPage = lazy(() => import("@/pages/auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("@/pages/auth/ResetPasswordPage"));
const AcceptInvitationPage = lazy(() => import("@/pages/auth/AcceptInvitationPage"));
const IncidentsListPage = lazy(() => import("@/pages/incidents/IncidentsListPage"));
const IncidentDetailsPage = lazy(() => import("@/pages/incidents/IncidentDetailsPage"));
const CreateIncidentPage = lazy(() => import("@/pages/incidents/CreateIncidentPage"));
const MembersPage = lazy(() => import("@/pages/members/MembersPage"));
const NotificationsPage = lazy(() => import("@/pages/notifications/NotificationsPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

// Suspense wrapper for lazy routes
const PageSuspense: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex h-64 items-center justify-center">
        <Spinner size="md" />
      </div>
    }
  >
    {children}
  </Suspense>
);

// Authenticated layout wrapper with notification subscription
const AuthenticatedLayout: React.FC = () => {
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const { data: countData } = useGetUnreadNotificationCountQuery(undefined, {
    skip: !isAuthenticated,
    pollingInterval: 30000, // Poll unread notifications every 30 seconds
  });

  const unreadCount = countData?.data?.unreadCount || 0;

  return (
    <ProtectedRoute>
      <AppLayout unreadNotificationCount={unreadCount} />
    </ProtectedRoute>
  );
};

export const router = createBrowserRouter([
  // Public Auth Routes
  {
    path: "/login",
    element: (
      <PageSuspense>
        <LoginPage />
      </PageSuspense>
    ),
  },
  {
    path: "/register-organization",
    element: (
      <PageSuspense>
        <RegisterOrgPage />
      </PageSuspense>
    ),
  },
  {
    path: "/setup-workspace",
    element: (
      <PageSuspense>
        <SetupWorkspacePage />
      </PageSuspense>
    ),
  },
  {
    path: "/forgot-password",
    element: (
      <PageSuspense>
        <ForgotPasswordPage />
      </PageSuspense>
    ),
  },
  {
    path: "/reset-password",
    element: (
      <PageSuspense>
        <ResetPasswordPage />
      </PageSuspense>
    ),
  },
  {
    path: "/accept-invitation",
    element: (
      <PageSuspense>
        <AcceptInvitationPage />
      </PageSuspense>
    ),
  },

  // Protected App Routes
  {
    path: "/",
    element: <AuthenticatedLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: "dashboard",
        element: <DashboardPage />,
      },
      {
        path: "incidents",
        element: (
          <PageSuspense>
            <IncidentsListPage />
          </PageSuspense>
        ),
      },
      {
        path: "incidents/new",
        element: (
          <PageSuspense>
            <CreateIncidentPage />
          </PageSuspense>
        ),
      },
      {
        path: "incidents/:incidentId",
        element: (
          <PageSuspense>
            <IncidentDetailsPage />
          </PageSuspense>
        ),
      },
      {
        path: "members",
        element: (
          <PageSuspense>
            <MembersPage />
          </PageSuspense>
        ),
      },
      {
        path: "notifications",
        element: (
          <PageSuspense>
            <NotificationsPage />
          </PageSuspense>
        ),
      },
      {
        path: "settings",
        element: (
          <PageSuspense>
            <SettingsPage />
          </PageSuspense>
        ),
      },
    ],
  },

  // 404 Catch-All
  {
    path: "*",
    element: (
      <PageSuspense>
        <NotFoundPage />
      </PageSuspense>
    ),
  },
]);

