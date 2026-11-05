import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { IncidentsByPriorityData, INCIDENT_PRIORITY, IncidentPriority } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, RotateCw } from "lucide-react";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { EChart } from "@/components/charts/EChart";
import { ChartSkeleton } from "@/components/charts/ChartSkeleton";
import { CHART_COLORS, getChartTheme } from "@/components/charts/chartTheme";
import { useAppSelector } from "@/app/hooks";

export interface PriorityDistributionChartProps {
  data?: IncidentsByPriorityData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const PRIORITY_COLORS: Record<IncidentPriority, string> = {
  [INCIDENT_PRIORITY.LOW]: CHART_COLORS.p4,
  [INCIDENT_PRIORITY.MEDIUM]: CHART_COLORS.p3,
  [INCIDENT_PRIORITY.HIGH]: CHART_COLORS.p2,
  [INCIDENT_PRIORITY.CRITICAL]: CHART_COLORS.p1,
};

const PRIORITY_LABELS: Record<IncidentPriority, string> = {
  [INCIDENT_PRIORITY.LOW]: "Low",
  [INCIDENT_PRIORITY.MEDIUM]: "Medium",
  [INCIDENT_PRIORITY.HIGH]: "High",
  [INCIDENT_PRIORITY.CRITICAL]: "Critical",
};

export const PriorityDistributionChart: React.FC<PriorityDistributionChartProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const isDark = useAppSelector((s) => s.ui.theme === "dark");
  const theme = useMemo(() => getChartTheme(isDark), [isDark]);

  const priorityCounts = data?.priorityCounts || {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const total = data?.total || 0;

  const chartData = [
    {
      name: PRIORITY_LABELS.LOW,
      value: priorityCounts.LOW || 0,
      itemStyle: { color: PRIORITY_COLORS.LOW },
      priority: INCIDENT_PRIORITY.LOW,
    },
    {
      name: PRIORITY_LABELS.MEDIUM,
      value: priorityCounts.MEDIUM || 0,
      itemStyle: { color: PRIORITY_COLORS.MEDIUM },
      priority: INCIDENT_PRIORITY.MEDIUM,
    },
    {
      name: PRIORITY_LABELS.HIGH,
      value: priorityCounts.HIGH || 0,
      itemStyle: { color: PRIORITY_COLORS.HIGH },
      priority: INCIDENT_PRIORITY.HIGH,
    },
    {
      name: PRIORITY_LABELS.CRITICAL,
      value: priorityCounts.CRITICAL || 0,
      itemStyle: { color: PRIORITY_COLORS.CRITICAL },
      priority: INCIDENT_PRIORITY.CRITICAL,
    },
  ];

  const criticalAndHighCount = (priorityCounts.CRITICAL || 0) + (priorityCounts.HIGH || 0);

  const chartOption = useMemo<EChartsOption>(() => ({
    legend: { show: false }, // Use custom HTML legend below the chart
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number };
        return `<div style="font-weight:600">${p.name}</div>
          <div style="margin-top:4px;font-variant-numeric:tabular-nums">
            <span style="font-weight:700">${p.value}</span>
            <span style="color:rgba(255,255,255,0.65);margin-left:4px">(${p.percent.toFixed(1)}%)</span>
          </div>`;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["58%", "80%"],
        center: ["50%", "50%"],
        padAngle: 3,
        itemStyle: { borderRadius: 4, borderColor: "transparent", borderWidth: 0 },
        label: { show: false },
        labelLine: { show: false },
        emphasis: {
          scale: true,
          scaleSize: 4,
          itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,0.25)" },
        },
        data: chartData,
      },
    ],
  }), [chartData, theme]);

  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <div className="h-5 w-40 bg-pill rounded animate-pulse" />
          <div className="h-4 w-56 bg-pill rounded animate-pulse mt-1" />
        </CardHeader>
        <CardContent className="h-72 flex items-center justify-center">
          <ChartSkeleton height={200} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-96 border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle>Incidents by Priority</CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <p className="text-xs text-sev-p1">Failed to load priority distribution.</p>
          <Button size="sm" variant="outline" onClick={onRetry} leftIcon={<RotateCw className="h-3.5 w-3.5" />}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>By severity</CardTitle>
          {criticalAndHighCount > 0 && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-pill bg-sev-p1-subtle text-sev-p1 tabular-nums">
              {criticalAndHighCount} Critical/High
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between">
        {total === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-muted-fg">
            No incident priority data for this period.
          </div>
        ) : (
          <>
            <div className="relative h-52 w-full pt-1">
              {/* Perfectly centered inner KPI text */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center select-none">
                <span className="text-2xl font-bold tracking-tight text-main-fg tabular-nums leading-none">
                  {total}
                </span>
                <span className="text-[10px] font-medium text-muted-fg uppercase tracking-wider mt-0.5">
                  total
                </span>
              </div>
              <EChart option={chartOption} isDark={isDark} height={200} notMerge />
            </div>

            {/* Legend: severity shape + label, count and share */}
            <div className="grid grid-cols-1 gap-1.5 pt-3 border-t border-border-color">
              {[...chartData].reverse().map((item) => (
                <div key={item.priority} className="flex items-center justify-between text-xs">
                  <PriorityBadge priority={item.priority} />
                  <span className="font-semibold text-main-fg tabular-nums">
                    {item.value}{" "}
                    <span className="font-normal text-muted-fg">
                      ({total > 0 ? Math.round((item.value / total) * 100) : 0}%)
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PriorityDistributionChart;
