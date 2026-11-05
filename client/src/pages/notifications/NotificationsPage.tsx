import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useListNotificationsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useGetUnreadNotificationCountQuery,
} from "@/features/notifications/notificationsApi";
import {
  NotificationItem,
  NotificationType,
  NOTIFICATION_TYPES,
} from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import {
  Bell,
  CheckCheck,
  Check,
  UserCheck,
  Activity,
  AlertTriangle,
  MessageSquare,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isFetching, isError, refetch } = useListNotificationsQuery({
    page,
    limit: 15,
    unread: filter === "unread" ? true : undefined,
  });

  const { data: countData } = useGetUnreadNotificationCountQuery();
  const unreadCount = countData?.data?.unreadCount ?? data?.data?.unreadCount ?? 0;

  const [markAsRead, { isLoading: isMarkingSingle }] = useMarkNotificationAsReadMutation();
  const [markAllAsRead, { isLoading: isMarkingAll }] = useMarkAllNotificationsAsReadMutation();

  const notifications = data?.data?.notifications || [];
  const pagination = data?.data?.pagination;

  const handleMarkAllRead = async () => {
    setActionError(null);
    try {
      await markAllAsRead().unwrap();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
    }
  };

  const handleMarkSingleRead = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setActionError(null);
    try {
      await markAsRead(id).unwrap();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    if (!item.isRead) {
      try {
        await markAsRead(item.id).unwrap();
      } catch {
        // Silently navigate even if marking read has a transient error
      }
    }
    if (item.incident?.id) {
      navigate(`/incidents/${item.incident.id}`);
    }
  };

  const renderTypeIcon = (type: NotificationType) => {
    switch (type) {
      case NOTIFICATION_TYPES.INCIDENT_ASSIGNED:
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-950/70 dark:text-purple-400">
            <UserCheck className="h-4 w-4" />
          </div>
        );
      case NOTIFICATION_TYPES.INCIDENT_STATUS_CHANGED:
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400">
            <Activity className="h-4 w-4" />
          </div>
        );
      case NOTIFICATION_TYPES.INCIDENT_PRIORITY_CHANGED:
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400">
            <AlertTriangle className="h-4 w-4" />
          </div>
        );
      case NOTIFICATION_TYPES.INCIDENT_COMMENT_ADDED:
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950/70 dark:text-sky-400">
            <MessageSquare className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-950/70 dark:text-brand-400">
            <Bell className="h-4 w-4" />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-main-fg">
              Notifications
            </h1>
            {unreadCount > 0 && (
              <span className="rounded-full border border-brand-200/60 bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:border-brand-800/40 dark:bg-brand-950 dark:text-brand-300 tabular-nums">
                {unreadCount} unread
              </span>
            )}
          </div>
          <p className="text-sm text-muted-fg mt-1">
            Stay informed on incident assignments, status transitions, and team discussions
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0 || isMarkingAll}
            isLoading={isMarkingAll}
            leftIcon={<CheckCheck className="h-4 w-4" />}
          >
            Mark All as Read
          </Button>
        </div>
      </div>

      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Filter Tabs Card */}
      <Card>
        <div className="border-b border-slate-200 px-6 pt-3 dark:border-slate-800">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setPage(1);
              }}
              className={`flex items-center gap-2 border-b-2 pb-3.5 text-sm font-semibold transition-colors ${
                filter === "all"
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-muted-fg dark:hover:text-slate-200"
              }`}
            >
              All Notifications
            </button>
            <button
              type="button"
              onClick={() => {
                setFilter("unread");
                setPage(1);
              }}
              className={`flex items-center gap-2 border-b-2 pb-3.5 text-sm font-semibold transition-colors ${
                filter === "unread"
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-muted-fg dark:hover:text-slate-200"
              }`}
            >
              Unread Only
              {unreadCount > 0 && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white dark:bg-brand-500 tabular-nums">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <CardContent className="p-4 sm:p-6">
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : isError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
              <p>Failed to load notifications.</p>
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
                Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-12">
              <EmptyState
                icon={
                  filter === "unread" ? (
                    <Sparkles className="h-10 w-10 text-emerald-500" />
                  ) : (
                    <Bell className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  )
                }
                title={filter === "unread" ? "All caught up!" : "No notifications"}
                description={
                  filter === "unread"
                    ? "You have no unread notifications at this time."
                    : "Activity related to assigned incidents and team updates will appear here."
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`group relative flex items-start gap-4 rounded-xl border p-4 transition-all cursor-pointer ${
                    !item.isRead
                      ? "border-brand-200 bg-brand-50/30 hover:bg-brand-50/60 dark:border-brand-900/40 dark:bg-brand-950/20 dark:hover:bg-brand-950/30"
                      : "border-slate-200/80 bg-white hover:bg-slate-50/70 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:bg-slate-800/40"
                  }`}
                >
                  {/* Unread dot indicator */}
                  {!item.isRead && (
                    <span className="absolute top-4 right-4 flex h-2 w-2 rounded-full bg-brand-600 dark:bg-brand-400" />
                  )}

                  {/* Icon */}
                  {renderTypeIcon(item.type)}

                  {/* Details */}
                  <div className="flex-1 min-w-0 pr-6">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-main-fg">
                        {item.title}
                      </span>
                      <span
                        className="text-[11px] text-muted-fg"
                        title={new Date(item.createdAt).toLocaleString()}
                      >
                        • {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                      {item.message}
                    </p>

                    {/* Incident context tag if available */}
                    {item.incident && (
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200 group-hover:bg-brand-100/60 dark:group-hover:bg-brand-900/30 transition-colors">
                          <span className="truncate max-w-[220px]">
                            {item.incident.title}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-fg" />
                        </div>

                        {item.incident.status && (
                          <StatusBadge status={item.incident.status} size="sm" />
                        )}
                        {item.incident.priority && (
                          <PriorityBadge priority={item.incident.priority} size="sm" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Quick Mark Read Action */}
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={(e) => handleMarkSingleRead(e, item.id)}
                      disabled={isMarkingSingle}
                      className="shrink-0 rounded-lg p-1.5 text-muted-fg opacity-60 hover:opacity-100 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-all"
                      title="Mark as read"
                      aria-label="Mark as read"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}

              {/* Pagination controls */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t border-border-color text-xs">
                  <span className="text-slate-500">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} notifications)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isFetching}
                      onClick={() => setPage((p) => Math.max(p - 1, 1))}
                      className="h-8 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages || isFetching}
                      onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                      className="h-8 text-xs"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;
