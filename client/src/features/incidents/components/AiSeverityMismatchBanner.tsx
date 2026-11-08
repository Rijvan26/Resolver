import React from "react";
import { mismatchFlag } from "../mismatchUtils";
import { AlertTriangle, AlertCircle, Sparkles } from "lucide-react";

interface AiSeverityMismatchBannerProps {
  reportedSeverity?: string | null;
  rulesSeverity?: string | null;
}

export const AiSeverityMismatchBanner: React.FC<AiSeverityMismatchBannerProps> = ({
  reportedSeverity,
  rulesSeverity,
}) => {
  const result = mismatchFlag({ reportedSeverity, rulesSeverity });

  if (!result.mismatch) {
    return null;
  }

  const isUnder = result.direction === "under";

  return (
    <div
      role="alert"
      className={`rounded-lg border p-3.5 text-xs shadow-sm ${
        isUnder
          ? "border-red-300/90 bg-red-50/90 text-red-950 dark:border-red-800/80 dark:bg-red-950/40 dark:text-red-200"
          : "border-amber-300/80 bg-amber-50/80 text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 mt-0.5 ${
            isUnder
              ? "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300"
          }`}
        >
          {isUnder ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-xs tracking-tight">
              {isUnder ? "⚠️ Dangerous Severity Under-Reporting" : "Severity Mismatch Detected"}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                isUnder
                  ? "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300"
                  : "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
              }`}
            >
              <Sparkles className="h-2.5 w-2.5" />
              Rules Engine (FR-12)
            </span>
          </div>
          <p className="mt-1 leading-relaxed text-[11px] opacity-95">
            {result.message}
          </p>
          {isUnder && (
            <p className="mt-1 text-[11px] font-medium text-red-800 dark:text-red-300">
              Note: Under-reporting can delay on-call responder paging and breach incident response SLAs.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export const AiSeverityMismatchPill: React.FC<AiSeverityMismatchBannerProps> = ({
  reportedSeverity,
  rulesSeverity,
}) => {
  const result = mismatchFlag({ reportedSeverity, rulesSeverity });

  if (!result.mismatch) {
    return null;
  }

  const isUnder = result.direction === "under";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold border ${
        isUnder
          ? "border-red-300 bg-red-100/90 text-red-800 dark:border-red-800 dark:bg-red-950/70 dark:text-red-300"
          : "border-amber-300 bg-amber-100/90 text-amber-800 dark:border-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
      }`}
      title={result.message || "Severity mismatch between reported priority and rules"}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span>Mismatch ({result.rulesPriority})</span>
    </span>
  );
};

