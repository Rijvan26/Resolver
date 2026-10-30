import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import { Role } from "@/types";
import { Spinner } from "@/components/ui/spinner";

export interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: Role[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { isAuthenticated, isInitialized, user } = useAppSelector((state) => state.auth);
  const location = useLocation();

  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <Spinner size="lg" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Initializing session...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

