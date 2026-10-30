import { ACTIVITY_ACTION, ActivityAction } from "@/types";

/**
 * Format Date to YYYY-MM-DD string for backend query params.
 */
export function formatDateToISO(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type DateRangePreset = "all" | "7d" | "30d" | "90d" | "custom";

export interface DateRangeState {
  preset: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

/**
 * Compute startDate and endDate for a given preset.
 */
export function getDateRangeFromPreset(preset: DateRangePreset): {
  startDate?: string;
  endDate?: string;
} {
  const now = new Date();
  const end = formatDateToISO(now);

  if (preset === "7d") {
    const past = new Date(now);
    past.setDate(past.getDate() - 6);
    return { startDate: formatDateToISO(past), endDate: end };
  }

  if (preset === "30d") {
    const past = new Date(now);
    past.setDate(past.getDate() - 29);
    return { startDate: formatDateToISO(past), endDate: end };
  }

  if (preset === "90d") {
    const past = new Date(now);
    past.setDate(past.getDate() - 89);
    return { startDate: formatDateToISO(past), endDate: end };
  }

  if (preset === "all") {
    return { startDate: undefined, endDate: undefined };
  }

  return {};
}

/**
 * Validates date range constraints (<= 90 days, start <= end).
 */
export function validateDateRange(
  startDate?: string,
  endDate?: string
): { isValid: boolean; error?: string } {
  if (!startDate && !endDate) return { isValid: true };
  if (!startDate || !endDate) {
    return { isValid: false, error: "Both start and end dates are required for custom range." };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return { isValid: false, error: "Invalid date format." };
  }

  if (start > end) {
    return { isValid: false, error: "Start date cannot be after end date." };
  }

  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 90) {
    return { isValid: false, error: "Date range cannot exceed 90 days (backend maximum limit)." };
  }

  return { isValid: true };
}

/**
 * Convert activity action enum to user-friendly label.
 */
export function formatActivityAction(action: string | ActivityAction): string {
  switch (action) {
    case ACTIVITY_ACTION.INCIDENT_CREATED:
      return "Incident reported";
    case ACTIVITY_ACTION.STATUS_CHANGED:
      return "Status updated";
    case ACTIVITY_ACTION.PRIORITY_CHANGED:
      return "Priority changed";
    case ACTIVITY_ACTION.ASSIGNEE_CHANGED:
      return "Assignee changed";
    case ACTIVITY_ACTION.DETAILS_UPDATED:
      return "Details updated";
    case ACTIVITY_ACTION.COMMENT_ADDED:
      return "Comment posted";
    case ACTIVITY_ACTION.COMMENT_UPDATED:
      return "Comment edited";
    case ACTIVITY_ACTION.COMMENT_DELETED:
      return "Comment removed";
    case ACTIVITY_ACTION.INCIDENT_DELETED:
      return "Incident archived";
    default:
      return action.replace(/_/g, " ").toLowerCase();
  }
}

/**
 * Human friendly relative time formatter.
 */
export function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return dateString;
  }
}

