import React from "react";
import { useAppSelector } from "@/app/hooks";
import { Role } from "@/types";

export interface RoleGateProps {
  allowedRoles: Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export const RoleGate: React.FC<RoleGateProps> = ({
  allowedRoles,
  children,
  fallback = null,
}) => {
  const { user } = useAppSelector((state) => state.auth);

  if (!user || !allowedRoles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
};

