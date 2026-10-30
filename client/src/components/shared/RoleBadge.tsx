import React from "react";
import { Role, ROLES } from "@/types";
import { Badge } from "@/components/ui/badge";

export interface RoleBadgeProps {
  role: Role;
  size?: "sm" | "md";
  className?: string;
}

export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, size = "sm", className }) => {
  switch (role) {
    case ROLES.SUPER_ADMIN:
      return (
        <Badge
          size={size}
          className={`bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800/40 ${className || ""}`}
        >
          Super Admin
        </Badge>
      );
    case ROLES.ADMIN:
      return (
        <Badge
          size={size}
          className={`bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800/40 ${className || ""}`}
        >
          Admin
        </Badge>
      );
    case ROLES.MANAGER:
      return (
        <Badge
          size={size}
          className={`bg-sky-50 text-sky-700 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800/40 ${className || ""}`}
        >
          Manager
        </Badge>
      );
    case ROLES.DEVELOPER:
      return (
        <Badge
          size={size}
          className={`bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 ${className || ""}`}
        >
          Developer
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size={size} className={className}>
          {role}
        </Badge>
      );
  }
};

