import React from "react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";
import { IncidentsByStatusData, INCIDENT_STATUS, IncidentStatus } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PieChart as PieChartIcon, AlertCircle, RotateCw } from "lucide-react";

export interface StatusDistributionChartProps {
  data?: IncidentsByStatusData;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

const STATUS_COLORS: Record<IncidentStatus, string> = {
  [INCIDENT_STATUS.OPEN]: "#f59e0b", // Amber
  [INCIDENT_STATUS.IN_PROGRESS]: "#0284c7", // Sky blue
  [INCIDENT_STATUS.RESOLVED]: "#10b981", // Emerald
  [INCIDENT_STATUS.CLOSED]: "#64748b", // Slate
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
  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="h-72 flex items-center justify-center">
          <Skeleton className="h-48 w-48 rounded-full" />
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
          <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          <p className="text-xs text-rose-700 dark:text-rose-300">
            Failed to load status distribution.
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

  const statusCounts = data?.statusCounts || {
    OPEN: 0,
    IN_PROGRESS: 0,
    RESOLVED: 0,
    CLOSED: 0,
  };
  const total = data?.total || 0;

  const chartData = [
    {
      status: INCIDENT_STATUS.OPEN,
      name: STATUS_LABELS.OPEN,
      value: statusCounts.OPEN || 0,
      color: STATUS_COLORS.OPEN,
    },
    {
      status: INCIDENT_STATUS.IN_PROGRESS,
      name: STATUS_LABELS.IN_PROGRESS,
      value: statusCounts.IN_PROGRESS || 0,
      color: STATUS_COLORS.IN_PROGRESS,
    },
    {
      status: INCIDENT_STATUS.RESOLVED,
      name: STATUS_LABELS.RESOLVED,
      value: statusCounts.RESOLVED || 0,
      color: STATUS_COLORS.RESOLVED,
    },
    {
      status: INCIDENT_STATUS.CLOSED,
      name: STATUS_LABELS.CLOSED,
      value: statusCounts.CLOSED || 0,
      color: STATUS_COLORS.CLOSED,
    },
  ];

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
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200/60 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 text-slate-700 dark:text-slate-300 tabular-nums">
            Total: {total.toLocaleString()}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col justify-between">
        {total === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-slate-400">
            No incident status data for this period.
          </div>
        ) : (
          <>
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0];
                        const count = Number(item.value) || 0;
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
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartData.map((entry) => (
                      <Cell key={`cell-${entry.status}`} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Custom structured legend with percentages */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              {chartData.map((item) => {
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
                return (
                  <div key={item.status} className="flex items-center justify-between text-xs py-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                    </div>
                    <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                      {item.value}{" "}
                      <span className="text-[11px] font-normal text-slate-400">({pct}%)</span>
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

