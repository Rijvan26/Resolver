import React, { useState } from "react";
import {
  useGetSuggestedRunbooksQuery,
  useRecordRunbookFeedbackMutation,
} from "../aiApi";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Sparkles,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Tag,
  CheckCircle2,
} from "lucide-react";

interface AiSuggestedRunbooksCardProps {
  incidentId: string;
}

export const AiSuggestedRunbooksCard: React.FC<AiSuggestedRunbooksCardProps> = ({
  incidentId,
}) => {
  const { data, isLoading, isFetching, refetch } =
    useGetSuggestedRunbooksQuery(incidentId);
  const [recordFeedback, { isLoading: isSubmitting }] =
    useRecordRunbookFeedbackMutation();

  const [feedbackGiven, setFeedbackGiven] = useState<"useful" | "not_useful" | null>(null);

  const result = data?.data;
  const isAvailable = result?.aiAvailable ?? true;
  const runbooks = result?.runbooks ?? [];
  const suggestionId = result?.suggestionId;

  const handleFeedback = async (type: "useful" | "not_useful") => {
    if (!suggestionId || isSubmitting) return;
    try {
      await recordFeedback({
        incidentId,
        suggestionId,
        feedback: type,
      }).unwrap();
      setFeedbackGiven(type);
    } catch (err) {
      console.error("Failed to submit runbook feedback:", err);
    }
  };

  if (!isLoading && !isAvailable) {
    return null;
  }

  return (
    <Card className="border border-slate-200/80 shadow-sm dark:border-slate-800 max-w-full overflow-hidden">
      <CardHeader className="py-3 px-4 sm:px-5 border-b border-slate-100 dark:border-slate-800/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-50 text-violet-600 dark:bg-violet-950/60 dark:text-violet-400">
              <BookOpen className="h-4 w-4" />
            </div>
            <h3 className="text-[15px] sm:text-base font-semibold text-main-fg truncate min-w-0">
              Suggested Runbooks
            </h3>
            <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/50 whitespace-nowrap shrink-0">
              <Sparkles className="h-2.5 w-2.5" />
              AI-generated
            </span>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 flex-wrap min-w-0">
            <span className="sm:hidden inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/50 whitespace-nowrap shrink-0">
              <Sparkles className="h-2.5 w-2.5" />
              AI-generated
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              className="min-h-[40px] sm:min-h-0 sm:h-7 px-3 sm:px-2 text-xs text-muted-fg hover:text-main-fg shrink-0"
              title="Refresh runbook suggestions"
              aria-label="Refresh runbook suggestions"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 shrink-0 ${isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 pt-3 sm:pt-4 space-y-3 max-w-full">
        {isLoading ? (
          <div className="space-y-2 pt-1">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : runbooks.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-200 dark:border-slate-800 p-4 text-center">
            <p className="text-xs text-muted-fg">
              No matching runbooks found for this incident or its service.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {runbooks.map((rb, idx) => (
              <div
                key={rb.url || idx}
                className="group rounded-md border border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-900/50 p-3 text-xs hover:border-violet-300 dark:hover:border-violet-700/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <a
                      href={rb.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-violet-700 dark:text-violet-400 hover:underline group-hover:text-violet-800 dark:group-hover:text-violet-300"
                    >
                      <span className="truncate">{rb.title}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
                    </a>

                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                      {rb.explanation || rb.reason}
                    </p>

                    {rb.tags && rb.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <Tag className="h-2.5 w-2.5 text-muted-fg" />
                        {rb.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-600 dark:text-slate-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {rb.score > 0 && (
                    <span className="shrink-0 rounded-full bg-violet-50 dark:bg-violet-950/40 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:text-violet-300 border border-violet-200/50 dark:border-violet-800/40">
                      {(rb.score * 100).toFixed(0)}% match
                    </span>
                  )}
                </div>
              </div>
            ))}

            {/* Useful / Not Useful Feedback Section */}
            {suggestionId && (
              <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2.5 text-xs text-muted-fg">
                <span>Were these runbooks helpful?</span>
                <div className="flex items-center gap-1.5">
                  {feedbackGiven ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-violet-700 dark:text-violet-400 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Feedback recorded: {feedbackGiven === "useful" ? "Useful" : "Not useful"}
                    </span>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleFeedback("useful")}
                        className="h-6 px-2 text-[11px] hover:text-emerald-700 hover:border-emerald-300 dark:hover:text-emerald-400 inline-flex items-center gap-1"
                      >
                        <ThumbsUp className="h-3 w-3" />
                        Useful
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSubmitting}
                        onClick={() => handleFeedback("not_useful")}
                        className="h-6 px-2 text-[11px] hover:text-rose-700 hover:border-rose-300 dark:hover:text-rose-400 inline-flex items-center gap-1"
                      >
                        <ThumbsDown className="h-3 w-3" />
                        Not useful
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AiSuggestedRunbooksCard;

