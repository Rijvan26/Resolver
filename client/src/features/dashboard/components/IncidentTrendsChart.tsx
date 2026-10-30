import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { DailyTrendEntry } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, AlertCircle, RotateCw } from "lucide-react";

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
  if (isLoading) {
    return (
      <Card className="h-96">
        <CardHeader>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="h-72 flex items-center justify-center">
          <Skeleton className="h-64 w-full" />
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
          <AlertCircle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
          <p className="text-xs text-rose-700 dark:text-rose-300">
            Failed to load incident trend timeline.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
          >
            Retry Trends
          </Button>
        </CardContent>
      </Card>
    );
  }

  const formatXAxis = (dateStr: string) => {
    try {
      const parts = dateStr.split("-");
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  const totalCreated = trends.reduce((acc, curr) => acc + curr.created, 0);
  const totalResolved = trends.reduce((acc, curr) => acc + curr.resolved, 0);
  const hasData = trends.length > 0;

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
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="text-slate-600 dark:text-slate-400">Created:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {totalCreated.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="text-slate-600 dark:text-slate-400">Resolved:</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {totalResolved.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          <div className="flex h-64 items-center justify-center text-xs text-slate-400">
            No incident timeline events recorded for this period.
          </div>
        ) : (
          <div className="h-72 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.2} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  interval="preserveStartEnd"
                  minTickGap={25}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      const createdVal = payload[0]?.value ?? 0;
                      const resolvedVal = payload[1]?.value ?? 0;
                      return (
                        <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
                          <p className="text-xs font-bold text-slate-900 dark:text-white">
                            {formatXAxis(String(label))} ({label})
                          </p>
                          <div className="mt-2 space-y-1 text-xs">
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                                <span className="h-2 w-2 rounded-full bg-rose-500" />
                                Created:
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {createdVal}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                Resolved:
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {resolvedVal}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  iconType="circle"
                  wrapperStyle={{ paddingBottom: 10, fontSize: 12 }}
                />
                <Area
                  type="monotone"
                  dataKey="created"
                  name="Created"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#createdGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="resolved"
                  name="Resolved"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#resolvedGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default IncidentTrendsChart;

