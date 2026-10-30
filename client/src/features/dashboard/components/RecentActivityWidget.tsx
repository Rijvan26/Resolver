import React from "react";
import { Link } from "react-router-dom";
import { PaginatedRecentActivity } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatActivityAction, formatRelativeTime } from "../dashboardUtils";
import {
  Activity,
  AlertCircle,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Clock,
} from "lucide-react";

export interface RecentActivityWidgetProps {
  data?: PaginatedRecentActivity;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  page: number;
  onPageChange: (newPage: number) => void;
}

export const RecentActivityWidget: React.FC<RecentActivityWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
  page,
  onPageChange,
}) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <Skeleton className="h-7 w-7 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-full border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle>Recent Incident Activity</CardTitle>
          <CardDescription>Organization audit timeline</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          <p className="text-xs text-rose-700 dark:text-rose-300">
            Failed to load recent activity stream.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const activities = data?.activities || [];
  const pagination = data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <CardTitle>Recent Organization Activity</CardTitle>
            </div>
            <CardDescription>Real-time audit log across all incidents</CardDescription>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {pagination.total} Total Events
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {activities.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-slate-400">
            No recent activity recorded for this organization yet.
          </div>
        ) : (
          <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {activities.map((item) => {
              const formattedAction = formatActivityAction(item.action);
              const relativeTime = formatRelativeTime(item.createdAt);

              return (
                <div key={item.id} className="relative group">
                  {/* Timeline point */}
                  <div className="absolute -left-6 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-slate-900 ring-2 ring-slate-200 dark:ring-slate-700 group-hover:ring-brand-500 transition-colors">
                    <span className="h-2 w-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition-colors dark:border-slate-800/80 dark:bg-slate-900/40 dark:hover:bg-slate-900/80">
                    <div className="flex flex-wrap items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {item.actor.name}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          {formattedAction}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        <span>{relativeTime}</span>
                      </div>
                    </div>

                    {/* Associated incident details */}
                    {item.incident && (
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2 border border-slate-200/80 dark:bg-slate-950 dark:border-slate-800">
                        <Link
                          to={`/incidents/${item.incident.id}`}
                          className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 truncate max-w-xs"
                        >
                          <span className="truncate">{item.incident.title}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                        </Link>

                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={item.incident.status} size="sm" />
                          <PriorityBadge priority={item.incident.priority} size="sm" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {pagination.totalPages > 1 && (
        <CardFooter className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-3">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="h-7 px-2"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => onPageChange(page + 1)}
              className="h-7 px-2"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export default RecentActivityWidget;

