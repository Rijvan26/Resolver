import React, { useState } from "react";
import { DateRangePreset, DateRangeState, getDateRangeFromPreset, validateDateRange } from "../dashboardUtils";
import { Button } from "@/components/ui/button";
import { Calendar, RotateCw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DashboardDateFilterProps {
  value: DateRangeState;
  onChange: (next: DateRangeState) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const DashboardDateFilter: React.FC<DashboardDateFilterProps> = ({
  value,
  onChange,
  onRefresh,
  isRefreshing = false,
}) => {
  const [customStart, setCustomStart] = useState(value.startDate || "");
  const [customEnd, setCustomEnd] = useState(value.endDate || "");
  const [customError, setCustomError] = useState<string | null>(null);

  const presets: { id: DateRangePreset; label: string }[] = [
    { id: "all", label: "All Time" },
    { id: "7d", label: "Last 7 Days" },
    { id: "30d", label: "Last 30 Days" },
    { id: "90d", label: "Last 90 Days" },
    { id: "custom", label: "Custom" },
  ];

  const handleSelectPreset = (preset: DateRangePreset) => {
    setCustomError(null);
    if (preset === "custom") {
      onChange({ preset: "custom", startDate: customStart || undefined, endDate: customEnd || undefined });
      return;
    }

    const { startDate, endDate } = getDateRangeFromPreset(preset);
    onChange({ preset, startDate, endDate });
  };

  const handleApplyCustom = () => {
    const validation = validateDateRange(customStart, customEnd);
    if (!validation.isValid) {
      setCustomError(validation.error || "Invalid date range");
      return;
    }

    setCustomError(null);
    onChange({
      preset: "custom",
      startDate: customStart,
      endDate: customEnd,
    });
  };

  return (
    <div className="flex flex-col gap-3 min-w-0 max-w-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 min-w-0 max-w-full">
        {/* Preset selector buttons (horizontally scrollable on small mobile) */}
        <div className="flex items-center overflow-x-auto max-w-full min-w-0 py-0.5 scrollbar-none">
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {presets.map((preset) => {
              const isActive = value.preset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handleSelectPreset(preset.id)}
                  type="button"
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-all select-none whitespace-nowrap",
                    isActive
                      ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                      : "text-slate-600 hover:text-slate-900 dark:text-muted-fg dark:hover:text-white"
                  )}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Refresh action */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            leftIcon={<RotateCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />}
          >
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Custom date range inputs */}
      {value.preset === "custom" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/60 animate-in fade-in slide-in-from-top-1 duration-150">
          <Calendar className="h-4 w-4 text-muted-fg shrink-0" />
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">From:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">To:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 shadow-sm focus:border-brand-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </div>
          <Button size="sm" variant="primary" onClick={handleApplyCustom} className="text-xs py-1 h-7">
            Apply Range
          </Button>

          <span className="text-[11px] text-muted-fg">
            (Maximum 90 days)
          </span>

          {customError && (
            <div className="w-full flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>{customError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DashboardDateFilter;

