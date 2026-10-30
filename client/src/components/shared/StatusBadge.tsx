import React from "react";
import { IncidentStatus, INCIDENT_STATUS } from "@/types";
import { Badge } from "@/components/ui/badge";

export interface StatusBadgeProps {
  status: IncidentStatus;
  size?: "sm" | "md";
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = "sm", className }) => {
  switch (status) {
    case INCIDENT_STATUS.OPEN:
      return (
        <Badge variant="info" size={size} dot className={className}>
          Open
        </Badge>
      );
    case INCIDENT_STATUS.IN_PROGRESS:
      return (
        <Badge variant="warning" size={size} dot className={className}>
          In Progress
        </Badge>
      );
    case INCIDENT_STATUS.RESOLVED:
      return (
        <Badge variant="success" size={size} dot className={className}>
          Resolved
        </Badge>
      );
    case INCIDENT_STATUS.CLOSED:
      return (
        <Badge variant="default" size={size} dot className={className}>
          Closed
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size={size} className={className}>
          {status}
        </Badge>
      );
  }
};

