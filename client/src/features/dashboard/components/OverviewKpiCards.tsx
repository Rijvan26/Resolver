import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { OverviewStats, DailyTrendEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCw, TrendingUp } from "lucide-react";
import { EChart } from "@/components/charts/EChart";
import { CHART_COLORS } from "@/components/charts/chartTheme";
import { areaGradient } from "@/components/charts/chartUtils";

export interface OverviewKpiCardsProps {
  data?: OverviewStats;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  hasDateFilter: boolean;
  trends?: DailyTrendEntry[];
}

export const OverviewKpiCards: React.FC<OverviewKpiCardsProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
  hasDateFilter,
  trends,
}) => {
  const sparkData = useMemo(() => (trends || []).map((t) => t.created), [trends]);

  const sparkOption = useMemo<EChartsOption>(() => ({
    grid: { left: 0, right: 0, top: 4, bottom: 0 },
    xAxis: { type: "category", show: false, boundaryGap: false },
    yAxis: { type: "value", show: false },
    tooltip: { show: false },
    animation: false,
    series: [
      {
        type: "line",
        smooth: true,
        data: sparkData,
        symbol: "none",
        lineStyle: { color: CHART_COLORS.accent, width: 2 },
        areaStyle: { color: areaGradient(CHART_COLORS.accent, 0.45, 0.0) },
      },
    ],
  }), [sparkData]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <Card key={idx} className="p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-16" />
            <Skeleton className="h-3 w-28" />
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card className="bg-sev-p1-subtle p-6 text-center">
        <div className="flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <h4 className="text-sm font-semibold text-main-fg">Failed to load overview metrics</h4>
          <p className="text-xs text-muted-fg">
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

  const active = data.open + data.inProgress;

  const kpis = [
    {
      title: "Active incidents",
      value: active,
      description: `${data.open} open · ${data.inProgress} in progress`,
      highlight: true,
    },
    {
      title: "Critical unresolved",
      value: data.criticalUnresolved,
      description: data.criticalUnresolved > 0 ? "Urgent attention required" : "Nothing critical open",
      valueTone: data.criticalUnresolved > 0 ? "text-sev-p1" : "",
    },
    {
      title: "Resolved",
      value: data.resolved,
      description: hasDateFilter ? `${data.resolvedInRange} resolved in range` : "Awaiting verification",
    },
    {
      title: "Total incidents",
      value: data.total,
      description: hasDateFilter ? `${data.createdInRange} created in range` : `${data.closed} closed · all time`,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.title}
            className={`relative overflow-hidden p-5 min-h-[150px] ${
              kpi.highlight ? "border-transparent bg-sidebar text-white dark:border-border-color" : ""
            }`}
          >
            <span className={`text-sm ${kpi.highlight ? "text-white/70" : "text-muted-fg"}`}>{kpi.title}</span>

            <div
              className={`mt-2 text-4xl font-bold tracking-tighter tabular-nums ${
                kpi.highlight ? "text-white" : kpi.valueTone || "text-main-fg"
              }`}
            >
              {kpi.value.toLocaleString()}
            </div>

            <p className={`mt-2 text-sm ${kpi.highlight ? "text-white/70" : "text-muted-fg"}`}>
              {kpi.description}
            </p>

            {kpi.highlight && sparkData.length > 1 && (
              <div className="absolute bottom-0 right-4 h-16 w-[55%] pointer-events-none" aria-hidden="true">
                <EChart option={sparkOption} height={64} notMerge />
              </div>
            )}
          </Card>
        ))}
      </div>

      {hasDateFilter && (
        <div className="flex items-center gap-2 text-xs text-muted-fg px-1">
          <TrendingUp className="h-3.5 w-3.5 text-accent" />
          <span>
            Selected range activity:{" "}
            <strong className="font-semibold text-main-fg tabular-nums">{data.createdInRange}</strong> created,{" "}
            <strong className="font-semibold text-main-fg tabular-nums">{data.resolvedInRange}</strong> resolved
          </span>
        </div>
      )}
    </div>
  );
};

export default OverviewKpiCards;
