import React from "react";
import { IncidentPriority, INCIDENT_PRIORITY } from "@/types";
import { cn } from "@/lib/utils";

export interface PriorityBadgeProps {
  priority: IncidentPriority;
  size?: "sm" | "md";
  className?: string;
}

type Shape = "triangle" | "diamond" | "circle" | "square";

// Visual-only mapping of backend priorities onto the severity scale (color + shape + label)
export const PRIORITY_STYLE: Record<
  IncidentPriority,
  { label: string; level: string; shape: Shape; colorClass: string; tone: string }
> = {
  [INCIDENT_PRIORITY.CRITICAL]: {
    label: "Critical",
    level: "P1",
    shape: "triangle",
    colorClass: "text-sev-p1",
    tone: "bg-sev-p1-subtle text-sev-p1 border-sev-p1-border",
  },
  [INCIDENT_PRIORITY.HIGH]: {
    label: "High",
    level: "P2",
    shape: "diamond",
    colorClass: "text-sev-p2",
    tone: "bg-sev-p2-subtle text-sev-p2 border-sev-p2-border",
  },
  [INCIDENT_PRIORITY.MEDIUM]: {
    label: "Medium",
    level: "P3",
    shape: "circle",
    colorClass: "text-sev-p3",
    tone: "bg-sev-p3-subtle text-sev-p3 border-sev-p3-border",
  },
  [INCIDENT_PRIORITY.LOW]: {
    label: "Low",
    level: "P4",
    shape: "square",
    colorClass: "text-sev-p4",
    tone: "bg-sev-p4-subtle text-sev-p4 border-sev-p4-border",
  },
};

const ShapeIcon: React.FC<{ shape: Shape; className?: string }> = ({ shape, className }) => (
  <svg viewBox="0 0 10 10" className={cn("h-2.5 w-2.5 shrink-0", className)} fill="currentColor" aria-hidden="true">
    {shape === "triangle" && <polygon points="5,1 9.5,9 0.5,9" />}
    {shape === "diamond" && <polygon points="5,0.5 9.5,5 5,9.5 0.5,5" />}
    {shape === "circle" && <circle cx="5" cy="5" r="4" />}
    {shape === "square" && <rect x="1" y="1" width="8" height="8" rx="1" />}
  </svg>
);

export interface SeverityIconProps {
  priority: IncidentPriority;
  className?: string;
}

export const SeverityIcon: React.FC<SeverityIconProps> = ({ priority, className }) => {
  const style = PRIORITY_STYLE[priority];
  if (!style) return null;

  return (
    <span
      title={`${style.level} — ${style.label}`}
      aria-label={`${style.level} ${style.label}`}
      className={cn("inline-flex items-center justify-center shrink-0", style.colorClass, className)}
    >
      <ShapeIcon shape={style.shape} className="h-3 w-3" />
    </span>
  );
};

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority, size = "sm", className }) => {
  const style = PRIORITY_STYLE[priority];

  return (
    <span
      title={style ? style.level : undefined}
      className={cn(
        "inline-flex items-center rounded-pill border font-medium select-none tracking-tight leading-tight gap-1.5",
        size === "sm" ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-xs",
        style ? style.tone : "bg-pill text-muted-fg border-border-color",
        className
      )}
    >
      {style && <ShapeIcon shape={style.shape} />}
      {style ? style.label : priority}
    </span>
  );
};
