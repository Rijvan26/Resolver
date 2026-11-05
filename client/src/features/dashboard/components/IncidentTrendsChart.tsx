import React, { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { DailyTrendEntry } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertCircle, RotateCw } from "lucide-react";
import { EChart } from "@/components/charts/EChart";
import { ChartSkeleton } from "@/components/charts/ChartSkeleton";
import { CHART_COLORS, getChartTheme } from "@/components/charts/chartTheme";
import { formatDateShort, areaGradient } from "@/components/charts/chartUtils";
import { useAppSelector } from "@/app/hooks";

export interface IncidentTrendsChartProps {
  trends?: DailyTrendEntry[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  startDate?: string;
  endDate?: string;
}

export const IncidentTrendsChart: React.FC<IncidentTrendsChartProps> = ({
  trends = [],
  isLoading,
  isError,
  onRetry,
  startDate,
  endDate,
}) => {
  const isDark = useAppSelector((s) => s.ui.theme === "dark");
  const theme = useMemo(() => getChartTheme(isDark), [isDark]);

  const totalCreated = trends.reduce((acc, curr) => acc + curr.created, 0);
  const totalResolved = trends.reduce((acc, curr) => acc + curr.resolved, 0);
  const hasData = trends.length > 0;

  const chartOption = useMemo<EChartsOption>(() => {
    const dates = trends.map((t) => formatDateShort(t.date));
    const created = trends.map((t) => t.created);
    const resolved = trends.map((t) => t.resolved);
    const { _computed } = theme;

    return {
      legend: { show: false }, // Use custom HTML indicator pills in card header instead
      grid: {
        left: 12,
        right: 16,
        top: 20,
        bottom: 24,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: dates,
        boundaryGap: false,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: _computed.textColor,
          fontSize: 10,
          margin: 12,
          hideOverlap: true,
          fontFamily: "Inter, sans-serif",
        },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: _computed.gridColor, type: "dashed" } },
        axisLabel: {
          color: _computed.textColor,
          fontSize: 10,
          margin: 10,
          fontFamily: "Inter, sans-serif",
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "line",
          lineStyle: { color: CHART_COLORS.accent, width: 1, type: "dashed" },
        },
        formatter: (params: unknown) => {
          const p = params as { name: string; seriesName: string; value: number; color: string }[];
          if (!p.length) return "";
          return (
            `<div style="font-weight:700;font-size:12px;margin-bottom:4px">${p[0].name}</div>` +
            p
              .map(
                (item) =>
                  `<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:4px">
                    <span style="display:flex;align-items:center;gap:6px">
                      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color}"></span>
                      <span style="color:rgba(255,255,255,0.8)">${item.seriesName}</span>
                    </span>
                    <span style="font-weight:600;font-variant-numeric:tabular-nums">${item.value}</span>
                  </div>`
              )
              .join("")
          );
        },
      },
      series: [
        {
          name: "Created",
          type: "line",
          smooth: true,
          data: created,
          symbol: "circle",
          symbolSize: 5,
          showSymbol: false,
          lineStyle: { color: CHART_COLORS.accent, width: 2.5 },
          itemStyle: { color: CHART_COLORS.accent },
          areaStyle: { color: areaGradient(CHART_COLORS.accent, 0.35, 0.0) },
          emphasis: { focus: "series" },
        },
        {
          name: "Resolved",
          type: "line",
          smooth: true,
          data: resolved,
          symbol: "circle",
          symbolSize: 5,
          showSymbol: false,
          lineStyle: { color: CHART_COLORS.success, width: 2 },
          itemStyle: { color: CHART_COLORS.success },
          areaStyle: { color: areaGradient(CHART_COLORS.success, 0.25, 0.0) },
          emphasis: { focus: "series" },
        },
      ],
    };
  }, [trends, theme]);

  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <div className="h-5 w-48 bg-pill rounded animate-pulse" />
          <div className="h-4 w-72 bg-pill rounded animate-pulse mt-1" />
        </CardHeader>
        <CardContent>
          <ChartSkeleton height={280} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-96 border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle>Incident Velocity Trends</CardTitle>
          <CardDescription>Daily creations vs. resolutions</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <p className="text-xs text-sev-p1">Failed to load incident trend timeline.</p>
          <Button size="sm" variant="outline" onClick={onRetry} leftIcon={<RotateCw className="h-3.5 w-3.5" />}>
            Retry Trends
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <CardTitle>Incident Velocity Trends</CardTitle>
            </div>
            <CardDescription>
              Daily rate of incident creation vs. resolution
              {startDate && endDate ? ` (${startDate} to ${endDate})` : " (Continuous daily series)"}
            </CardDescription>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent" />
              <span className="text-muted-fg">Created:</span>
              <span className="font-semibold text-main-fg tabular-nums">{totalCreated.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-healthy" />
              <span className="text-muted-fg">Resolved:</span>
              <span className="font-semibold text-main-fg tabular-nums">{totalResolved.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-fg">
            No incident timeline events recorded for this period.
          </div>
        ) : (
          <EChart option={chartOption} isDark={isDark} height={288} notMerge />
        )}
      </CardContent>
    </Card>
  );
};

export default IncidentTrendsChart;
