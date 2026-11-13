import React, { useState } from "react";
import {
  useGetIncidentAlertsQuery,
  useRecordAlertDecisionMutation,
} from "../incidentsApi";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import {
  BellRing,
  Sparkles,
  RefreshCw,
  Check,
  X,
  AlertTriangle,
  Radio,
  Fingerprint,
} from "lucide-react";

interface GroupedAlertsCardProps {
  incidentId: string;
}

export const GroupedAlertsCard: React.FC<GroupedAlertsCardProps> = ({
  incidentId,
}) => {
  const { data, isLoading, isFetching, refetch } =
    useGetIncidentAlertsQuery(incidentId);
  const [recordDecision, { isLoading: isMutating }] =
    useRecordAlertDecisionMutation();

  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);

  const alertsData = data?.data;
  const groupedAlerts = alertsData?.groupedAlerts ?? [];
  const suggestedAlerts = alertsData?.suggestedAlerts ?? [];
  const alertCount = alertsData?.alertCount ?? groupedAlerts.length;

  const handleDecision = async (alertId: string, decision: "accept" | "dismiss") => {
    try {
      setActiveAlertId(alertId);
      await recordDecision({ incidentId, alertId, decision }).unwrap();
    } catch (err) {
      console.error(`Failed to ${decision} alert group suggestion:`, err);
    } finally {
      setActiveAlertId(null);
    }
  };

  return (
    <Card className="border border-slate-200/80 shadow-sm dark:border-slate-800 max-w-full overflow-hidden">
      <CardHeader className="py-3 px-4 sm:px-5 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
              <BellRing className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] sm:text-base font-semibold text-main-fg truncate min-w-0">
              Grouped Alerts
            </h3>
            <span className="hidden sm:inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap shrink-0">
              {alertCount} {alertCount === 1 ? "alert" : "alerts"}
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap sm:hidden">
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">
                {alertCount} {alertCount === 1 ? "alert" : "alerts"}
              </span>
              {suggestedAlerts.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 whitespace-nowrap">
                  <AlertTriangle className="h-3 w-3" />
                  {suggestedAlerts.length} review
                </span>
              )}
            </div>
            {suggestedAlerts.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 border border-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60 whitespace-nowrap">
                <AlertTriangle className="h-3 w-3" />
                {suggestedAlerts.length} review required
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="min-h-[40px] sm:min-h-0 sm:h-7 px-3 sm:px-2 text-xs text-muted-fg hover:text-main-fg shrink-0"
              title="Refresh alerts"
              aria-label="Refresh alerts"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-4 max-w-full">
        {isLoading ? (
          <div className="space-y-2 pt-1">
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ) : (
          <>
            {/* AI-Suggested Groups (Pending Human Confirmation) */}
            {suggestedAlerts.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>AI-Suggested Groups Awaiting Review</span>
                </div>

                <div className="space-y-2">
                  {suggestedAlerts.map(({ alert, similarityScore, reason, isTier1Safeguard }) => (
                    <div
                      key={alert._id}
                      className="rounded-lg border border-violet-200/80 bg-violet-50/40 p-3 text-xs transition-colors dark:border-violet-900/60 dark:bg-violet-950/20"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <PriorityBadge priority={alert.severity} size="sm" />
                            <span className="font-semibold text-main-fg truncate">
                              {alert.title}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800 dark:bg-violet-900/50 dark:text-violet-300">
                              <Sparkles className="h-2.5 w-2.5" />
                              AI-suggested group
                            </span>
                            {isTier1Safeguard && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                Tier-1 Safeguard
                              </span>
                            )}
                          </div>

                          <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed line-clamp-2">
                            {alert.description}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] text-muted-fg flex-wrap pt-0.5">
                            <span className="inline-flex items-center gap-1">
                              <Radio className="h-3 w-3" />
                              {alert.source || "custom"}
                            </span>
                            <span>•</span>
                            <span>{formatRelativeTime(alert.createdAt)}</span>
                            {similarityScore !== undefined && (
                              <>
                                <span>•</span>
                                <span className="font-medium text-violet-700 dark:text-violet-300">
                                  {(similarityScore * 100).toFixed(0)}% semantic match
                                </span>
                              </>
                            )}
                            {reason && !similarityScore && (
                              <>
                                <span>•</span>
                                <span className="italic">{reason}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Accept / Dismiss Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <Button
                            size="sm"
                            onClick={() => handleDecision(alert._id, "accept")}
                            disabled={isMutating}
                            className="h-7 px-2.5 text-xs bg-violet-600 hover:bg-violet-700 text-white font-medium inline-flex items-center gap-1 shadow-sm"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {activeAlertId === alert._id ? "Accepting..." : "Accept"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDecision(alert._id, "dismiss")}
                            disabled={isMutating}
                            className="h-7 px-2.5 text-xs border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                          >
                            <X className="h-3.5 w-3.5" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirmed Grouped Alerts */}
            {groupedAlerts.length === 0 && suggestedAlerts.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center">
                <p className="text-xs text-muted-fg">
                  No alerts currently grouped into this incident.
                </p>
              </div>
            ) : groupedAlerts.length > 0 ? (
              <div className="space-y-2">
                {groupedAlerts.map((alert) => (
                  <div
                    key={alert._id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-2.5 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PriorityBadge priority={alert.severity} size="sm" />
                        <span className="font-medium text-main-fg truncate">
                          {alert.title}
                        </span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          {alert.source || "custom"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-fg flex-wrap">
                        <span>{formatRelativeTime(alert.createdAt)}</span>
                        <span>•</span>
                        <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                          <Fingerprint className="h-3 w-3" />
                          {alert.fingerprint.slice(0, 12)}...
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default GroupedAlertsCard;

