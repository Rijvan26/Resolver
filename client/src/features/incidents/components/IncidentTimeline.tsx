import React, { useState } from "react";
import { useGetIncidentTimelineQuery } from "@/features/incidents/timelineApi";
import {
  ActivityItem,
  ActivityAction,
  ACTIVITY_ACTION,
  IncidentStatus,
  IncidentPriority,
} from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import {
  History,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PlusCircle,
  Activity,
  AlertTriangle,
  UserCheck,
  Edit,
  MessageSquare,
  MessageSquareX,
  Trash2,
  Filter,
} from "lucide-react";

export interface IncidentTimelineProps {
  incidentId: string;
}

export const IncidentTimeline: React.FC<IncidentTimelineProps> = ({ incidentId }) => {
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [actionFilter, setActionFilter] = useState<ActivityAction | "ALL">("ALL");

  const { data, isLoading, isFetching, isError, refetch } = useGetIncidentTimelineQuery({
    incidentId,
    page,
    limit: 20,
    sortOrder,
    action: actionFilter === "ALL" ? undefined : actionFilter,
  });

  const timeline = data?.data?.timeline || [];
  const pagination = data?.data?.pagination;
  const totalEvents = pagination?.total || 0;

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  const renderActionIcon = (action: ActivityAction) => {
    switch (action) {
      case ACTIVITY_ACTION.INCIDENT_CREATED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400">
            <PlusCircle className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.STATUS_CHANGED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400">
            <Activity className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.PRIORITY_CHANGED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.ASSIGNEE_CHANGED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-950/70 dark:text-purple-400">
            <UserCheck className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.DETAILS_UPDATED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Edit className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.COMMENT_ADDED:
      case ACTIVITY_ACTION.COMMENT_UPDATED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950/70 dark:text-sky-400">
            <MessageSquare className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.COMMENT_DELETED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
            <MessageSquareX className="h-4 w-4" />
          </div>
        );
      case ACTIVITY_ACTION.INCIDENT_DELETED:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
            <Trash2 className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-muted-fg">
            <History className="h-4 w-4" />
          </div>
        );
    }
  };

  const renderActionContent = (item: ActivityItem) => {
    const meta = item.metadata as Record<string, any> | undefined;

    switch (item.action) {
      case ACTIVITY_ACTION.INCIDENT_CREATED:
        return (
          <div className="space-y-1">
            <span className="font-medium text-main-fg">
              created this incident
            </span>
            {meta?.title && (
              <span className="block text-slate-500 italic">"{meta.title}"</span>
            )}
          </div>
        );

      case ACTIVITY_ACTION.STATUS_CHANGED: {
        const before = meta?.before?.status as IncidentStatus | undefined;
        const after = meta?.after?.status as IncidentStatus | undefined;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-main-fg">changed status</span>
            {before && (
              <>
                <span className="text-muted-fg">from</span>
                <StatusBadge status={before} size="sm" />
              </>
            )}
            {after && (
              <>
                <span className="text-muted-fg">to</span>
                <StatusBadge status={after} size="sm" />
              </>
            )}
          </div>
        );
      }

      case ACTIVITY_ACTION.PRIORITY_CHANGED: {
        const before = meta?.before?.priority as IncidentPriority | undefined;
        const after = meta?.after?.priority as IncidentPriority | undefined;
        return (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-main-fg">changed priority</span>
            {before && (
              <>
                <span className="text-muted-fg">from</span>
                <PriorityBadge priority={before} size="sm" />
              </>
            )}
            {after && (
              <>
                <span className="text-muted-fg">to</span>
                <PriorityBadge priority={after} size="sm" />
              </>
            )}
          </div>
        );
      }

      case ACTIVITY_ACTION.ASSIGNEE_CHANGED: {
        const hasNewAssignee = Boolean(meta?.after?.assigneeId);
        return (
          <div className="space-y-0.5">
            <span className="text-main-fg">
              {hasNewAssignee ? "reassigned this incident" : "unassigned this incident"}
            </span>
          </div>
        );
      }

      case ACTIVITY_ACTION.DETAILS_UPDATED:
        return (
          <div className="space-y-0.5">
            <span className="text-main-fg">
              updated incident details (title or description)
            </span>
          </div>
        );

      case ACTIVITY_ACTION.COMMENT_ADDED:
        return (
          <div className="space-y-0.5">
            <span className="text-main-fg">added a comment</span>
          </div>
        );

      case ACTIVITY_ACTION.COMMENT_UPDATED:
        return (
          <div className="space-y-0.5">
            <span className="text-main-fg">edited a comment</span>
          </div>
        );

      case ACTIVITY_ACTION.COMMENT_DELETED:
        return (
          <div className="space-y-0.5">
            <span className="text-sev-p1">deleted a comment</span>
          </div>
        );

      case ACTIVITY_ACTION.INCIDENT_DELETED:
        return (
          <div className="space-y-0.5">
            <span className="text-sev-p1">deleted this incident</span>
          </div>
        );

      default:
        return (
          <span className="text-main-fg">
            performed action: {item.action}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-border-color">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-main-fg">
            Audit Trail & Timeline
          </h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {totalEvents}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="h-3.5 w-3.5 text-muted-fg" />
            <Select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value as ActivityAction | "ALL");
                setPage(1);
              }}
              className="text-xs h-7 py-0 px-2 min-w-[130px]"
            >
              <option value="ALL">All Events</option>
              <option value={ACTIVITY_ACTION.INCIDENT_CREATED}>Created</option>
              <option value={ACTIVITY_ACTION.STATUS_CHANGED}>Status Changes</option>
              <option value={ACTIVITY_ACTION.PRIORITY_CHANGED}>Priority Changes</option>
              <option value={ACTIVITY_ACTION.ASSIGNEE_CHANGED}>Assignments</option>
              <option value={ACTIVITY_ACTION.DETAILS_UPDATED}>Details Updates</option>
              <option value={ACTIVITY_ACTION.COMMENT_ADDED}>Comments Added</option>
              <option value={ACTIVITY_ACTION.COMMENT_DELETED}>Comments Deleted</option>
            </Select>
          </div>

          {/* Sort order toggle */}
          {totalEvents > 0 && (
            <button
              type="button"
              onClick={toggleSortOrder}
              className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-muted-fg dark:hover:text-slate-200 transition-colors"
            >
              <ArrowUpDown className="h-3 w-3" />
              <span>{sortOrder === "desc" ? "Newest First" : "Oldest First"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Timeline listing */}
      {isLoading ? (
        <div className="space-y-4 pt-2">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <p>Failed to load audit timeline.</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
            Retry
          </Button>
        </div>
      ) : timeline.length === 0 ? (
        <div className="py-6">
          <EmptyState
            icon={<History className="h-8 w-8 text-slate-300 dark:text-slate-600" />}
            title="No activity recorded"
            description={
              actionFilter !== "ALL"
                ? "No events match the selected filter."
                : "Activity and state changes will appear here automatically."
            }
          />
        </div>
      ) : (
        <div className="relative pl-6 space-y-6 before:absolute before:bottom-3 before:top-3 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
          {timeline.map((item) => (
            <div key={item.id} className="relative flex items-start gap-3 text-xs">
              {/* Event icon dot */}
              <div className="absolute -left-6 mt-0.5 shrink-0 bg-card-bg ring-4 ring-white dark:ring-slate-900 rounded-full">
                {renderActionIcon(item.action)}
              </div>

              {/* Event details card */}
              <div className="flex-1 rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 transition-all dark:border-slate-800/60 dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-900/70">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-main-fg">
                      {item.actor?.name || "System"}
                    </span>
                    {item.actor?.role && <RoleBadge role={item.actor.role} size="sm" />}
                  </div>

                  <span
                    className="text-[11px] text-muted-fg"
                    title={new Date(item.createdAt).toLocaleString()}
                  >
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                <div className="text-xs">{renderActionContent(item)}</div>
              </div>
            </div>
          ))}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-border-color text-xs">
              <span className="text-slate-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} events)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="h-7 text-xs px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="h-7 text-xs px-2"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default IncidentTimeline;

