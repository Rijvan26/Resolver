import React from "react";
import { IncidentPriority, INCIDENT_PRIORITY } from "@/types";
import { Badge } from "@/components/ui/badge";

export interface PriorityBadgeProps {
  priority: IncidentPriority;
  size?: "sm" | "md";
  className?: string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = "sm", className }) => {
  switch (priority) {
    case INCIDENT_PRIORITY.LOW:
      return (
        <Badge variant="default" size={size} dot className={className}>
          Low
        </Badge>
      );
    case INCIDENT_PRIORITY.MEDIUM:
      return (
        <Badge variant="info" size={size} dot className={className}>
          Medium
        </Badge>
      );
    case INCIDENT_PRIORITY.HIGH:
      return (
        <Badge variant="warning" size={size} dot className={className}>
          High
        </Badge>
      );
    case INCIDENT_PRIORITY.CRITICAL:
      return (
        <Badge variant="danger" size={size} dot className={className}>
          Critical
        </Badge>
      );
    default:
      return (
        <Badge variant="default" size={size} className={className}>
          {priority}
        </Badge>
      );
  }
};

