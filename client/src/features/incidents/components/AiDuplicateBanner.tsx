import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  AiSuggestion,
  AiDuplicateOutput,
  AI_USER_DECISION,
} from "@/types";
import { useRecordDecisionMutation } from "../aiApi";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Link2,
  X,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface AiDuplicateBannerProps {
  incidentId: string;
  duplicateSuggestion?: AiSuggestion<AiDuplicateOutput> | null;
  linkedIncidentIds?: string[];
  duplicateOf?: string | null;
}

export const AiDuplicateBanner: React.FC<AiDuplicateBannerProps> = ({
  incidentId,
  duplicateSuggestion,
  duplicateOf,
}) => {
  const [recordDecision, { isLoading }] = useRecordDecisionMutation();
  const [actionError, setActionError] = useState<string | null>(null);

  if (!duplicateSuggestion) {
    return null;
  }

  const output = duplicateSuggestion.output;
  if (!output || !output.bestMatchIncidentId) {
    return null;
  }

  const isPending = duplicateSuggestion.userDecision === AI_USER_DECISION.PENDING;
  const isAccepted = duplicateSuggestion.userDecision === AI_USER_DECISION.ACCEPTED;
  const isDismissed = duplicateSuggestion.userDecision === AI_USER_DECISION.DISMISSED;

  const scorePercent = Math.min(
    100,
    Math.max(0, Math.round((output.bestMatchScore || 0) * 100))
  );

  const handleLink = async () => {
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: duplicateSuggestion._id,
        incidentId,
        decision: "link",
        targetIncidentId: output.bestMatchIncidentId,
      }).unwrap();
    } catch (err: unknown) {
      setActionError(
        (err as { data?: { message?: string } })?.data?.message ||
          "Failed to link incident"
      );
    }
  };

  const handleDismiss = async () => {
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: duplicateSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.DISMISSED,
      }).unwrap();
    } catch (err: unknown) {
      setActionError(
        (err as { data?: { message?: string } })?.data?.message ||
          "Failed to dismiss suggestion"
      );
    }
  };

  // If dismissed, render nothing or small dismissed badge
  if (isDismissed) {
    return null;
  }

  // If already linked / accepted
  if (isAccepted || duplicateOf) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            Linked as duplicate of{" "}
            <Link
              to={`/incidents/${duplicateOf || output.bestMatchIncidentId}`}
              className="font-semibold underline hover:text-emerald-700 dark:hover:text-emerald-300"
            >
              {output.bestMatchTitle || `Incident #${(duplicateOf || output.bestMatchIncidentId).slice(-6)}`}
            </Link>
          </span>
        </div>
        <span className="inline-flex items-center gap-1 rounded bg-emerald-100/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300">
          Linked
        </span>
      </div>
    );
  }

  // Active Pending Banner
  return (
    <div className="rounded-lg border border-amber-200/90 bg-amber-50/80 p-3.5 shadow-sm dark:border-amber-800/80 dark:bg-amber-950/40">
      <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300 shrink-0 mt-0.5">
            <Copy className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                Possible duplicate of
              </span>
              <Link
                to={`/incidents/${output.bestMatchIncidentId}`}
                className="font-medium text-xs text-amber-900 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 underline line-clamp-1 inline-flex items-center gap-1"
              >
                {output.bestMatchTitle || `Incident #${output.bestMatchIncidentId.slice(-6)}`}
                <ExternalLink className="h-3 w-3 inline opacity-70 shrink-0" />
              </Link>
              <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-900/80 dark:text-amber-300 border border-amber-300/40 dark:border-amber-700/50">
                {scorePercent}% match
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100/60 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                <Sparkles className="h-2.5 w-2.5" />
                AI-generated
              </span>
            </div>
            {output.reason && (
              <p className="mt-1 text-[11px] leading-relaxed text-amber-800/90 dark:text-amber-300/90">
                {output.reason}
              </p>
            )}
            {actionError && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{actionError}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons: Link & Dismiss */}
        {isPending && (
          <div className="flex items-center gap-2 shrink-0 self-center sm:self-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={handleLink}
              disabled={isLoading}
              className="h-7 px-2.5 text-xs font-medium border-amber-300 bg-white hover:bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-slate-900 dark:hover:bg-amber-950 dark:text-amber-200"
            >
              <Link2 className="h-3.5 w-3.5 mr-1" />
              Link
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              disabled={isLoading}
              className="h-7 px-2 text-xs text-amber-800 hover:text-amber-950 dark:text-amber-300 dark:hover:text-amber-100"
              title="Dismiss duplicate suggestion"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

