import React from "react";
import { OverviewStats } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  Clock,
  CheckCircle2,
  Archive,
  ShieldAlert,
  Layers,
  RotateCw,
  TrendingUp,
} from "lucide-react";

export interface OverviewKpiCardsProps {
  data?: OverviewStats;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasDateFilter: boolean;
}

export const OverviewKpiCards: React.FC<OverviewKpiCardsProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
  hasDateFilter,
}) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, idx) => (
          <Card key={idx} className="p-4 space-y-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-8 w-12" />
            <Skeleton className="h-3 w-20" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="border-rose-200 bg-rose-50/50 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
        <div className="flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          <h4 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            Failed to load overview metrics
          </h4>
          <p className="text-xs text-rose-700 dark:text-rose-300">
            An error occurred while aggregating organization incident counts.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
            className="mt-2"
          >
            Retry Overview
          </Button>
        </div>
      </Card>
    );
  }

  const kpis = [
    {
      title: "Total Incidents",
      value: data.total,
      icon: <Layers className="h-4 w-4 text-slate-500" />,
      color: "text-slate-900 dark:text-white",
      description: hasDateFilter ? `${data.createdInRange} in range` : "All time recorded",
      badgeColor: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
    {
      title: "Open",
      value: data.open,
      icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
      color: "text-amber-600 dark:text-amber-400",
      description: "Awaiting triage / assignment",
      badgeColor: "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/40",
    },
    {
      title: "In Progress",
      value: data.inProgress,
      icon: <Clock className="h-4 w-4 text-blue-500" />,
      color: "text-blue-600 dark:text-blue-400",
      description: "Active investigation",
      badgeColor: "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/40",
    },
    {
      title: "Resolved",
      value: data.resolved,
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      color: "text-emerald-600 dark:text-emerald-400",
      description: hasDateFilter ? `${data.resolvedInRange} in range` : "Awaiting verification",
      badgeColor: "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/40",
    },
    {
      title: "Closed",
      value: data.closed,
      icon: <Archive className="h-4 w-4 text-slate-400" />,
      color: "text-slate-600 dark:text-slate-400",
      description: "Completed lifecycle",
      badgeColor: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    },
    {
      title: "Critical Active",
      value: data.criticalUnresolved,
      icon: <ShieldAlert className="h-4 w-4 text-rose-500" />,
      color: "text-rose-600 dark:text-rose-400",
      description: "Urgent attention required",
      isAlert: data.criticalUnresolved > 0,
      badgeColor: "bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/50",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((kpi, idx) => (
          <Card
            key={idx}
            className={`p-4 transition-all duration-200 hover:shadow-md ${
              kpi.isAlert
                ? "border-rose-300 bg-rose-50/30 ring-1 ring-rose-400/30 dark:border-rose-900/60 dark:bg-rose-950/20"
                : "border-slate-200/80 dark:border-slate-800"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {kpi.title}
              </span>
              <div className="rounded-lg p-1.5 bg-slate-50 dark:bg-slate-800/60">
                {kpi.icon}
              </div>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-bold tracking-tight ${kpi.color}`}>
                {kpi.value.toLocaleString()}
              </span>
            </div>

            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {kpi.description}
            </p>
          </Card>
        ))}
      </div>

      {hasDateFilter && (
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 px-1">
          <TrendingUp className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
          <span>
            Selected range activity: <strong>{data.createdInRange}</strong> created,{" "}
            <strong>{data.resolvedInRange}</strong> resolved
          </span>
        </div>
      )}
    </div>
  );
};

export default OverviewKpiCards;

