import React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { IncidentsByPriorityData, INCIDENT_PRIORITY, IncidentPriority } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { BarChart3, AlertCircle, RotateCw } from "lucide-react";

export interface PriorityDistributionChartProps {
  data?: IncidentsByPriorityData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const PRIORITY_COLORS: Record<IncidentPriority, string> = {
  [INCIDENT_PRIORITY.LOW]: "#64748b", // Slate
  [INCIDENT_PRIORITY.MEDIUM]: "#0284c7", // Sky blue
  [INCIDENT_PRIORITY.HIGH]: "#f59e0b", // Amber
  [INCIDENT_PRIORITY.CRITICAL]: "#e11d48", // Rose / Red
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
  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="h-72 flex items-center justify-center">
          <Skeleton className="h-52 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-96 border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle>Incidents by Priority</CardTitle>
          <CardDescription>Severity distribution breakdown</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          <p className="text-xs text-rose-700 dark:text-rose-300">
            Failed to load priority distribution.
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

  const priorityCounts = data?.priorityCounts || {
    LOW: 0,
    MEDIUM: 0,
    HIGH: 0,
    CRITICAL: 0,
  };
  const total = data?.total || 0;

  const chartData = [
    {
      priority: INCIDENT_PRIORITY.LOW,
      name: PRIORITY_LABELS.LOW,
      count: priorityCounts.LOW || 0,
      color: PRIORITY_COLORS.LOW,
    },
    {
      priority: INCIDENT_PRIORITY.MEDIUM,
      name: PRIORITY_LABELS.MEDIUM,
      count: priorityCounts.MEDIUM || 0,
      color: PRIORITY_COLORS.MEDIUM,
    },
    {
      priority: INCIDENT_PRIORITY.HIGH,
      name: PRIORITY_LABELS.HIGH,
      count: priorityCounts.HIGH || 0,
      color: PRIORITY_COLORS.HIGH,
    },
    {
      priority: INCIDENT_PRIORITY.CRITICAL,
      name: PRIORITY_LABELS.CRITICAL,
      count: priorityCounts.CRITICAL || 0,
      color: PRIORITY_COLORS.CRITICAL,
    },
  ];

  const criticalAndHighCount = (priorityCounts.CRITICAL || 0) + (priorityCounts.HIGH || 0);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
              <CardTitle>Incidents by Priority</CardTitle>
            </div>
            <CardDescription>Severity classification</CardDescription>
          </div>
          {criticalAndHighCount > 0 && (
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-rose-200/60 bg-rose-50 dark:border-rose-900/60 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 tabular-nums">
              {criticalAndHighCount} Critical/High
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between">
        {total === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-slate-400">
            No incident priority data for this period.
          </div>
        ) : (
          <>
            <div className="h-52 w-full pt-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
                  <XAxis
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0].payload;
                        const count = Number(item.count) || 0;
                        const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0";
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-md backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 text-xs">
                            <span className="font-semibold text-slate-900 dark:text-white">
                              {item.name}:
                            </span>{" "}
                            <span className="font-bold tabular-nums">{count}</span> ({pct}%)
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={45}>
                    {chartData.map((entry) => (
                      <Cell key={`bar-${entry.priority}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Custom summary chips */}
            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
              {chartData.map((item) => (
                <div key={item.priority} className="p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {item.name}
                  </div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                    {item.count}
                  </div>
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

