import React, { useState } from "react";
import {
  IncidentAiStatus,
  AiSuggestion,
  AiSummaryOutput,
} from "@/types";
import { useTriggerSummaryMutation } from "../aiApi";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import {
  FileText,
  RefreshCw,
  Clock,
  Sparkles,
  Activity,
  AlertCircle,
} from "lucide-react";

interface AiSummaryCardProps {
  incidentId: string;
  aiStatus?: IncidentAiStatus | null;
}

export const AiSummaryCard: React.FC<AiSummaryCardProps> = ({
  incidentId,
  aiStatus,
}) => {
  const [triggerSummary, { isLoading: isRefreshing }] = useTriggerSummaryMutation();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const summarySuggestion = aiStatus?.suggestions?.summary as AiSuggestion<AiSummaryOutput> | undefined;
  const aiSubdoc = aiStatus?.ai;

  const currentSummary = summarySuggestion?.output?.summary || aiSubdoc?.summary;
  const updatedAt = aiSubdoc?.summaryUpdatedAt || summarySuggestion?.createdAt;
  const keyMetrics = summarySuggestion?.output?.keyMetrics;
  const impact = summarySuggestion?.output?.impact;

  const handleRefresh = async () => {
    setErrorMsg(null);
    try {
      await triggerSummary(incidentId).unwrap();
    } catch (err) {
      setErrorMsg(parseApiError(err).message);
    }
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden max-w-full">
      <CardHeader className="bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60 py-3 px-4 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <CardTitle className="text-[15px] sm:text-base font-semibold text-main-fg truncate min-w-0">
              Incident Status Overview
            </CardTitle>
            <span className="hidden sm:inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-fg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
              AI-Generated
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-wrap min-w-0">
            <span className="sm:hidden inline-flex text-[10px] font-semibold uppercase tracking-wider text-muted-fg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
              AI-Generated
            </span>
            {updatedAt && (
              <span className="hidden sm:flex items-center gap-1 text-[11px] text-muted-fg shrink-0">
                <Clock className="h-3 w-3" />
                Updated {formatRelativeTime(updatedAt)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label={isRefreshing ? "Refreshing status overview" : "Refresh status overview"}
              leftIcon={
                <RefreshCw
                  className={`h-3.5 w-3.5 shrink-0 ${isRefreshing ? "animate-spin" : ""}`}
                />
              }
              className="text-xs min-h-[40px] sm:min-h-0 sm:h-7 px-3 sm:px-2.5 shrink-0"
            >
              <span className="hidden sm:inline">
                {isRefreshing ? "Refreshing..." : currentSummary ? "Refresh" : "Generate"}
              </span>
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-3">
        {currentSummary ? (
          <>
            <div className="text-sm leading-relaxed text-main-fg max-w-prose whitespace-pre-wrap">
              {currentSummary}
            </div>

            {/* Impact statement if present */}
            {impact && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 text-xs text-muted-fg flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  <strong>Impact:</strong> {impact}
                </span>
              </div>
            )}

            {/* Key Metrics grid if present */}
            {keyMetrics && Object.keys(keyMetrics).length > 0 && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-fg block mb-1.5">
                  Observed Telemetry Signals
                </span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(keyMetrics).map(([key, val]) => (
                    <div
                      key={key}
                      className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs font-mono text-main-fg flex items-center gap-1.5"
                    >
                      <Activity className="h-3 w-3 text-muted-fg" />
                      <span className="text-muted-fg">{key}:</span>
                      <strong className="font-semibold">{String(val)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="py-4 text-center space-y-2">
            <p className="text-xs text-muted-fg">
              No status summary generated yet. Responders can generate an instant synopsis of recent events and comments.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              leftIcon={<FileText className="h-3.5 w-3.5" />}
              className="text-xs"
            >
              {isRefreshing ? "Generating Summary..." : "Generate AI Summary"}
            </Button>
          </div>
        )}

        {errorMsg && <p className="text-xs text-rose-500 pt-1">{errorMsg}</p>}
      </CardContent>
    </Card>
  );
};

export default AiSummaryCard;

