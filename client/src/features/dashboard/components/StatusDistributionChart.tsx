import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { IncidentsByStatusData, INCIDENT_STATUS, IncidentStatus } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PieChart as PieChartIcon, AlertCircle, RotateCw } from "lucide-react";
import { EChart } from "@/components/charts/EChart";
import { ChartSkeleton } from "@/components/charts/ChartSkeleton";
import { CHART_COLORS } from "@/components/charts/chartTheme";
import { useAppSelector } from "@/app/hooks";

export interface StatusDistributionChartProps {
  data?: IncidentsByStatusData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  [INCIDENT_STATUS.OPEN]: CHART_COLORS.open,
  [INCIDENT_STATUS.IN_PROGRESS]: CHART_COLORS.inProgress,
  [INCIDENT_STATUS.RESOLVED]: CHART_COLORS.resolved,
  [INCIDENT_STATUS.CLOSED]: CHART_COLORS.closed,
};

const STATUS_LABELS: Record<IncidentStatus, string> = {
  [INCIDENT_STATUS.OPEN]: "Open",
  [INCIDENT_STATUS.IN_PROGRESS]: "In Progress",
  [INCIDENT_STATUS.RESOLVED]: "Resolved",
  [INCIDENT_STATUS.CLOSED]: "Closed",
};

export const StatusDistributionChart: React.FC<StatusDistributionChartProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  const isDark = useAppSelector((s) => s.ui.theme === "dark");
  const theme = useAppSelector((s) => s.ui.theme);

  const statusCounts = data?.statusCounts || { OPEN: 0, IN_PROGRESS: 0, RESOLVED: 0, CLOSED: 0 };
  const total = data?.total || 0;

  const chartData = [
    { name: STATUS_LABELS.OPEN, value: statusCounts.OPEN || 0, itemStyle: { color: STATUS_COLORS.OPEN } },
    { name: STATUS_LABELS.IN_PROGRESS, value: statusCounts.IN_PROGRESS || 0, itemStyle: { color: STATUS_COLORS.IN_PROGRESS } },
    { name: STATUS_LABELS.RESOLVED, value: statusCounts.RESOLVED || 0, itemStyle: { color: STATUS_COLORS.RESOLVED } },
    { name: STATUS_LABELS.CLOSED, value: statusCounts.CLOSED || 0, itemStyle: { color: STATUS_COLORS.CLOSED } },
  ];

  const chartOption = useMemo<EChartsOption>(() => ({
    legend: { show: false }, // Use custom HTML legend below
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const p = params as { name: string; value: number; percent: number; color: string };
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
          <CardTitle>Incidents by Status</CardTitle>
          <CardDescription>Current lifecycle breakdown</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <p className="text-xs text-sev-p1">Failed to load status distribution.</p>
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
          <div>
            <div className="flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <CardTitle>Incidents by Status</CardTitle>
            </div>
            <CardDescription>Breakdown by lifecycle stage</CardDescription>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200/60 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 text-main-fg tabular-nums">
            Total: {total.toLocaleString()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between">
        {total === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-muted-fg">
            No incident status data for this period.
          </div>
        ) : (
          <>
            <EChart option={chartOption} isDark={isDark} height={200} notMerge />

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border-color">
              {chartData.map((item) => {
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
                return (
                  <div key={item.name} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.itemStyle.color }}
                      />
                      <span className="text-muted-fg">{item.name}</span>
                    </div>
                    <span className="font-semibold text-main-fg tabular-nums">
                      {item.value}{" "}
                      <span className="text-[11px] font-normal text-muted-fg">({pct}%)</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default StatusDistributionChart;
