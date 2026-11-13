import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  useListIncidentsQuery,
} from "@/features/incidents/incidentsApi";
import { useGetMembersQuery } from "@/features/members/membersApi";
import {
  IncidentStatus,
  IncidentPriority,
  IncidentSortField,
  IncidentSortOrder,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
} from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge, SeverityIcon } from "@/components/shared/PriorityBadge";
import { AiSeverityMismatchPill } from "@/features/incidents/components/AiSeverityMismatchBanner";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import {
  Search,
  Plus,
  FilterX,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCw,
  Clock,
  User,
  ExternalLink,
} from "lucide-react";

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "<1m";
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (totalHours < 24) return mins > 0 ? `${totalHours}h ${mins}m` : `${totalHours}h`;
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

function formatOpenDuration(
  createdAt: string,
  status: IncidentStatus,
  resolvedAt?: string | null
): string {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return "—";

  if (status === INCIDENT_STATUS.OPEN || status === INCIDENT_STATUS.IN_PROGRESS) {
    return `open for ${formatDurationMs(Date.now() - createdMs)}`;
  }

  if (resolvedAt) {
    const resolvedMs = new Date(resolvedAt).getTime();
    if (!Number.isNaN(resolvedMs)) {
      return `Resolved (${formatDurationMs(resolvedMs - createdMs)})`;
    }
  }

  return status === INCIDENT_STATUS.RESOLVED ? "Resolved" : "Closed";
}

export const IncidentsListPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Read URL query parameters with fallbacks
  const pageParam = parseInt(searchParams.get("page") || "1", 10);
  const limitParam = parseInt(searchParams.get("limit") || "10", 10);
  const statusParam = (searchParams.get("status") as IncidentStatus) || "";
  const priorityParam = (searchParams.get("priority") as IncidentPriority) || "";
  const assigneeIdParam = searchParams.get("assigneeId") || "";
  const searchParam = searchParams.get("search") || "";
  const sortByParam = (searchParams.get("sortBy") as IncidentSortField) || "createdAt";
  const sortOrderParam = (searchParams.get("sortOrder") as IncidentSortOrder) || "desc";

  // Local search input state for debouncing
  const [searchInput, setSearchInput] = useState(searchParam);

  // Sync search input when URL changes externally
  useEffect(() => {
    setSearchInput(searchParam);
  }, [searchParam]);

  // Debounce search updates to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchParam) {
        updateQuery({ search: searchInput || undefined, page: "1" });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchInput]);

  // Helper to update URL search parameters cleanly
  const updateQuery = (updates: Record<string, string | undefined>) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(updates).forEach(([key, val]) => {
          if (val === undefined || val === "") {
            next.delete(key);
          } else {
            next.set(key, val);
          }
        });
        return next;
      },
      { replace: true }
    );
  };

  // Fetch active members for assignee filter
  const { data: membersData } = useGetMembersQuery({ status: "active", limit: 100 });
  const members = membersData?.data?.members || [];

  // Query incidents
  const queryArgs = useMemo(() => {
    return {
      page: pageParam,
      limit: limitParam,
      status: statusParam || undefined,
      priority: priorityParam || undefined,
      assigneeId: assigneeIdParam || undefined,
      search: searchParam || undefined,
      sortBy: sortByParam,
      sortOrder: sortOrderParam,
    };
  }, [
    pageParam,
    limitParam,
    statusParam,
    priorityParam,
    assigneeIdParam,
    searchParam,
    sortByParam,
    sortOrderParam,
  ]);

  const { data, isLoading, isFetching, isError, refetch } = useListIncidentsQuery(queryArgs);

  const incidents = data?.data?.incidents || [];
  const pagination = data?.data?.pagination || {
    page: pageParam,
    limit: limitParam,
    total: 0,
    totalPages: 1,
  };

  const hasActiveFilters = Boolean(
    statusParam || priorityParam || assigneeIdParam || searchParam || sortByParam !== "createdAt"
  );

  const handleClearFilters = () => {
    setSearchInput("");
    setSearchParams({});
  };

  const handleSortToggle = (field: IncidentSortField) => {
    if (sortByParam === field) {
      updateQuery({ sortOrder: sortOrderParam === "asc" ? "desc" : "asc", page: "1" });
    } else {
      updateQuery({ sortBy: field, sortOrder: "desc", page: "1" });
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-main-fg">
            Incidents
          </h1>
          <p className="mt-1 text-xs text-muted-fg">
            Track, triage, and resolve organizational incidents
          </p>
        </div>

        <Button
          variant="primary"
          onClick={() => navigate("/incidents/new")}
          leftIcon={<Plus className="h-4 w-4" />}
        >
          Report Incident
        </Button>
      </div>

      {/* Search & Filter Toolbar */}
      <Card className="p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {/* Search Input */}
            <div className="lg:col-span-2">
              <Input
                placeholder="Search incidents by title or description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                leftIcon={<Search className="h-4 w-4" />}
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusParam}
              onChange={(e) => updateQuery({ status: e.target.value || undefined, page: "1" })}
            >
              <option value="">All Statuses</option>
              <option value={INCIDENT_STATUS.OPEN}>Open</option>
              <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress</option>
              <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
              <option value={INCIDENT_STATUS.CLOSED}>Closed</option>
            </Select>

            {/* Priority Filter */}
            <Select
              value={priorityParam}
              onChange={(e) => updateQuery({ priority: e.target.value || undefined, page: "1" })}
            >
              <option value="">All Priorities</option>
              <option value={INCIDENT_PRIORITY.LOW}>Low</option>
              <option value={INCIDENT_PRIORITY.MEDIUM}>Medium</option>
              <option value={INCIDENT_PRIORITY.HIGH}>High</option>
              <option value={INCIDENT_PRIORITY.CRITICAL}>Critical</option>
            </Select>

            {/* Assignee Filter */}
            <Select
              value={assigneeIdParam}
              onChange={(e) => updateQuery({ assigneeId: e.target.value || undefined, page: "1" })}
            >
              <option value="">All Assignees</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Secondary Sorting and Clear Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border-color text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-muted-fg">Sort by:</span>
              <button
                type="button"
                onClick={() => handleSortToggle("createdAt")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                  sortByParam === "createdAt"
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-fg dark:hover:bg-slate-800"
                }`}
              >
                Created Date {sortByParam === "createdAt" && (sortOrderParam === "asc" ? "↑" : "↓")}
              </button>
              <button
                type="button"
                onClick={() => handleSortToggle("updatedAt")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                  sortByParam === "updatedAt"
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-fg dark:hover:bg-slate-800"
                }`}
              >
                Updated Date {sortByParam === "updatedAt" && (sortOrderParam === "asc" ? "↑" : "↓")}
              </button>
              <button
                type="button"
                onClick={() => handleSortToggle("priority")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                  sortByParam === "priority"
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-fg dark:hover:bg-slate-800"
                }`}
              >
                Priority {sortByParam === "priority" && (sortOrderParam === "asc" ? "↑" : "↓")}
              </button>
              <button
                type="button"
                onClick={() => handleSortToggle("status")}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-colors ${
                  sortByParam === "status"
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-muted-fg dark:hover:bg-slate-800"
                }`}
              >
                Status {sortByParam === "status" && (sortOrderParam === "asc" ? "↑" : "↓")}
              </button>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                leftIcon={<FilterX className="h-3.5 w-3.5" />}
                className="h-7 text-xs"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Incidents Table / Cards */}
      {isLoading ? (
        <Card className="p-4 space-y-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 border-b border-border-color last:border-0">
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-8 w-24" />
              </div>
            </div>
          ))}
        </Card>
      ) : isError ? (
        <Card className="border-rose-200 bg-rose-50/50 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <div className="flex flex-col items-center justify-center gap-2">
            <AlertTriangle className="h-8 w-8 text-sev-p1" />
            <h3 className="text-base font-semibold text-sev-p1">
              Failed to load incidents
            </h3>
            <p className="text-xs text-sev-p1 max-w-sm">
              We were unable to retrieve incidents from the server. Please check your network and try again.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              leftIcon={<RotateCw className="h-3.5 w-3.5" />}
              className="mt-3"
            >
              Retry
            </Button>
          </div>
        </Card>
      ) : incidents.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            title={hasActiveFilters ? "No matching incidents" : "No incidents reported yet"}
            description={
              hasActiveFilters
                ? "No incidents matched your current search filters. Try clearing or relaxing your filters."
                : "Your organization workspace has zero recorded incidents. Report an incident to start tracking."
            }
            icon={<AlertTriangle className="h-8 w-8 text-muted-fg" />}
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={handleClearFilters}>
                  Clear Filters
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => navigate("/incidents/new")}
                  leftIcon={<Plus className="h-4 w-4" />}
                >
                  Report First Incident
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50/75 dark:border-slate-800 dark:bg-slate-800/50">
                <tr>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Incident</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Status</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Priority</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Assignee</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Reporter</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Open For</th>
                  <th className="py-3.5 px-4 font-semibold text-main-fg">Updated</th>
                  <th className="py-3.5 px-4 text-right font-semibold text-main-fg">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-color">
                {incidents.map((incident) => {
                  const assignee = incident.assignee;
                  const creator =
                    typeof incident.createdBy === "object" ? incident.createdBy : null;
                  const openDurationLabel = formatOpenDuration(
                    incident.createdAt,
                    incident.status,
                    incident.resolvedAt
                  );

                  return (
                    <tr
                      key={incident.id}
                      onClick={() => navigate(`/incidents/${incident.id}`)}
                      className="cursor-pointer hover:bg-pill-hover transition-colors"
                    >
                      <td className="py-3.5 px-4 max-w-sm">
                        <div className="flex items-center gap-2">
                          <SeverityIcon priority={incident.priority} />
                          <span className="font-semibold text-main-fg truncate">
                            {incident.title}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-fg pl-5">
                          {incident.description}
                        </p>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge status={incident.status} size="sm" />
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <PriorityBadge priority={incident.priority} size="sm" />
                          <AiSeverityMismatchPill
                            reportedSeverity={incident.priority}
                            rulesSeverity={incident.ai?.severity}
                          />
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {assignee ? (
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                              {assignee.name.slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-main-fg font-medium truncate max-w-[120px]">
                              {assignee.name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-fg text-[11px] italic">Unassigned</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-muted-fg">
                        {creator?.name || "System"}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-muted-fg tabular-nums">
                        {openDurationLabel}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-muted-fg">
                        {formatRelativeTime(incident.updatedAt || incident.createdAt)}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <Link
                          to={`/incidents/${incident.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile / Small screen Cards View */}
          <div className="grid grid-cols-1 gap-3 lg:hidden">
            {incidents.map((incident) => (
              <Card
                key={incident.id}
                onClick={() => navigate(`/incidents/${incident.id}`)}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <SeverityIcon priority={incident.priority} />
                    <h3 className="text-sm font-semibold text-main-fg line-clamp-1">
                      {incident.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <StatusBadge status={incident.status} size="sm" />
                    <PriorityBadge priority={incident.priority} size="sm" />
                    <AiSeverityMismatchPill
                      reportedSeverity={incident.priority}
                      rulesSeverity={incident.ai?.severity}
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-fg line-clamp-2">
                  {incident.description}
                </p>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-border-color text-[11px] text-slate-500">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{incident.assignee?.name || "Unassigned"}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 tabular-nums">
                    <span>
                      {formatOpenDuration(
                        incident.createdAt,
                        incident.status,
                        incident.resolvedAt
                      )}
                    </span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{formatRelativeTime(incident.updatedAt || incident.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-2 pt-2">
            <div className="flex items-center gap-2 text-xs text-muted-fg">
              <span>
                Showing <strong>{incidents.length > 0 ? (pagination.page - 1) * pagination.limit + 1 : 0}</strong> to{" "}
                <strong>
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </strong>{" "}
                of <strong>{pagination.total}</strong> incidents
              </span>

              <div className="flex items-center gap-1 ml-4">
                <span>Per page:</span>
                <select
                  value={limitParam}
                  onChange={(e) => updateQuery({ limit: e.target.value, page: "1" })}
                  className="rounded border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isFetching}
                onClick={() => updateQuery({ page: String(pagination.page - 1) })}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold px-2 text-main-fg">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages || isFetching}
                onClick={() => updateQuery({ page: String(pagination.page + 1) })}
                rightIcon={<ChevronRight className="h-4 w-4" />}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IncidentsListPage;
