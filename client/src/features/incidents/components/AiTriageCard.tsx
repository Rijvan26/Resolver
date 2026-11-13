import React, { useState } from "react";
import {
  AiSuggestion,
  AiTriageOutput,
  IncidentAiStatus,
  IncidentPriority,
  AI_USER_DECISION,
} from "@/types";
import {
  useTriggerTriageMutation,
  useRecordDecisionMutation,
} from "../aiApi";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { parseApiError } from "@/lib/apiErrors";
import {
  Sparkles,
  ShieldAlert,
  Check,
  Edit3,
  X,
  Cpu,
  RefreshCw,
  Layers,
  Info,
  ArrowRight,
} from "lucide-react";

interface AiTriageCardProps {
  incidentId: string;
  aiStatus?: IncidentAiStatus | null;
  canModifySeverity: boolean;
  currentPriority: IncidentPriority;
}

export const AiTriageCard: React.FC<AiTriageCardProps> = ({
  incidentId,
  aiStatus,
  canModifySeverity,
}) => {
  const [triggerTriage, { isLoading: isTriggering }] = useTriggerTriageMutation();
  const [recordDecision, { isLoading: isDeciding }] = useRecordDecisionMutation();

  const [isEditing, setIsEditing] = useState(false);
  const [editedSeverity, setEditedSeverity] = useState<string>("HIGH");
  const [editedReason, setEditedReason] = useState<string>("");
  const [actionError, setActionError] = useState<string | null>(null);

  const triageSuggestion = aiStatus?.suggestions?.triage as AiSuggestion<AiTriageOutput> | undefined;
  const aiSubdoc = aiStatus?.ai;
  const finalSeverity = aiStatus?.finalSeverity;
  const aiAccepted = aiStatus?.aiAccepted;

  const isPendingDecision = triageSuggestion && triageSuggestion.userDecision === AI_USER_DECISION.PENDING;
  const isRuleBased = triageSuggestion?.model === "rules-engine" || triageSuggestion?.provider === "rules";

  const handleTrigger = async () => {
    setActionError(null);
    try {
      await triggerTriage({ incidentId }).unwrap();
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  const handleAccept = async () => {
    if (!triageSuggestion) return;
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: triageSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.ACCEPTED,
      }).unwrap();
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  const handleDismiss = async () => {
    if (!triageSuggestion) return;
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: triageSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.DISMISSED,
      }).unwrap();
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  const handleSaveEdit = async () => {
    if (!triageSuggestion) return;
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: triageSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.EDITED,
        editedOutput: {
          suggestedSeverity: editedSeverity,
          reason: editedReason || triageSuggestion.output.reason,
        },
      }).unwrap();
      setIsEditing(false);
    } catch (err) {
      setActionError(parseApiError(err).message);
    }
  };

  // 1. Initial Empty State: No triage yet
  if (!triageSuggestion && (!aiSubdoc || aiSubdoc.status === "none")) {
    return (
      <Card className="border-dashed border-slate-200 dark:border-slate-800 p-4 sm:p-5 max-w-full overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-main-fg truncate">AI & Rules Triage</h4>
              <p className="text-xs text-muted-fg line-clamp-1">
                Run deterministic rules engine and model triage to suggest severity.
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleTrigger}
            disabled={isTriggering}
            className="min-h-[40px] sm:min-h-0 text-xs shrink-0 self-start sm:self-auto"
            leftIcon={
              isTriggering ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Cpu className="h-3.5 w-3.5" />
              )
            }
          >
            {isTriggering ? "Evaluating..." : "Run Triage"}
          </Button>
        </div>
        {actionError && <p className="text-xs text-rose-500 mt-2">{actionError}</p>}
      </Card>
    );
  }

  // 2. Active Triage Card (Pending Decision or Decided)
  const output = triageSuggestion?.output;
  const suggestedSeverity = (output?.suggestedSeverity || aiSubdoc?.severity || "MEDIUM") as IncidentPriority;
  const confidence = output?.confidence ?? aiSubdoc?.confidence ?? 0.85;
  const confidencePercent = Math.round(confidence * 100);

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden max-w-full">
      {/* Header with Badges */}
      <CardHeader className="bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60 py-3 px-4 sm:px-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {isRuleBased ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 whitespace-nowrap shrink-0">
                <ShieldAlert className="h-3 w-3" />
                Deterministic Rule Match
              </span>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] sm:text-[11px] font-semibold bg-brand-100 text-brand-800 dark:bg-brand-950/80 dark:text-brand-300 whitespace-nowrap shrink-0">
                  <Sparkles className="h-3 w-3" />
                  AI Triage Recommendation
                </span>
                <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:border-brand-800 whitespace-nowrap shrink-0">
                  AI-generated
                </span>
              </>
            )}
            <span className="hidden sm:inline-block text-[11px] text-muted-fg font-medium">
              Human-in-the-Loop
            </span>
          </div>

          {/* Settled Decision Pill */}
          {!isPendingDecision && triageSuggestion && (
            <span
              className={`text-[10px] sm:text-[11px] font-semibold px-2 py-0.5 rounded whitespace-nowrap shrink-0 self-start sm:self-auto ${
                triageSuggestion.userDecision === AI_USER_DECISION.ACCEPTED
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                  : triageSuggestion.userDecision === AI_USER_DECISION.EDITED
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              Decision: {triageSuggestion.userDecision.toUpperCase()}
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-5 space-y-4 max-w-full">
        {/* Suggested Severity & Confidence Meter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="flex items-center gap-3">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-fg block mb-1">
                Suggested Severity
              </span>
              <div className="flex items-center gap-2">
                <PriorityBadge priority={suggestedSeverity} size="md" />
                <span className="text-xs text-muted-fg font-mono">
                  ({output?.suggestedSeverity || suggestedSeverity})
                </span>
              </div>
            </div>
          </div>

          {/* Confidence Score Bar */}
          <div className="sm:text-right min-w-[140px]">
            <div className="flex items-center justify-between sm:justify-end gap-2 text-xs mb-1">
              <span className="text-muted-fg text-[11px]">Model Confidence</span>
              <span className="font-semibold text-main-fg tabular-nums font-mono">
                {confidencePercent}%
              </span>
            </div>
            <div className="w-full sm:w-36 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  confidencePercent >= 90
                    ? "bg-emerald-500"
                    : confidencePercent >= 70
                    ? "bg-indigo-500"
                    : "bg-amber-500"
                }`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Reason / Technical Analysis */}
        <div className="text-xs space-y-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-muted-fg block">
            Technical Rationale
          </span>
          <p className="text-main-fg leading-relaxed bg-slate-50 dark:bg-slate-900/50 p-3 rounded-md border border-slate-100 dark:border-slate-800/60">
            {output?.reason || aiSubdoc?.reason || "Recommendation evaluated based on incident attributes."}
          </p>
        </div>

        {/* Culprit Service & Owning Team pills if present */}
        {(output?.suggestedService || output?.suggestedTeam) && (
          <div className="flex flex-wrap gap-2 text-xs pt-1">
            {output.suggestedService && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                <Layers className="h-3 w-3 text-muted-fg" />
                Service: <strong>{output.suggestedService}</strong>
              </span>
            )}
            {output.suggestedTeam && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Team: <strong>{output.suggestedTeam}</strong>
              </span>
            )}
          </div>
        )}

        {/* Official Status if Accepted */}
        {aiAccepted && finalSeverity && (
          <div className="flex items-center gap-2 p-2.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs border border-emerald-200 dark:border-emerald-900/60">
            <Check className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>
              Officially triaged: Incident severity confirmed as <strong>{finalSeverity}</strong>.
            </span>
          </div>
        )}

        {/* Inline Edit Form */}
        {isEditing && (
          <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-main-fg">
                Override Suggested Severity
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-muted-fg hover:text-main-fg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-muted-fg block mb-1">
                  Adjust Severity
                </label>
                <select
                  value={editedSeverity}
                  onChange={(e) => setEditedSeverity(e.target.value)}
                  className="w-full text-xs h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-main-fg"
                >
                  <option value="CRITICAL">P1 (Critical Outage)</option>
                  <option value="HIGH">P2 (High Degradation)</option>
                  <option value="MEDIUM">P3 (Medium Impact)</option>
                  <option value="LOW">P4 (Low / Minor)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-muted-fg block mb-1">
                  Edit Note / Reason
                </label>
                <input
                  type="text"
                  value={editedReason}
                  placeholder="Reason for adjustment"
                  onChange={(e) => setEditedReason(e.target.value)}
                  className="w-full text-xs h-8 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 text-main-fg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="text-xs h-7"
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                disabled={isDeciding}
                className="text-xs h-7"
              >
                {isDeciding ? "Saving..." : "Apply & Accept"}
              </Button>
            </div>
          </div>
        )}

        {/* Human-in-the-Loop Action Bar */}
        {isPendingDecision && !isEditing && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-fg">
              <Info className="h-3.5 w-3.5 text-muted-fg shrink-0" />
              <span>AI suggestions do not mutate incidents without responder action.</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                disabled={isDeciding}
                className="text-xs min-h-[40px] sm:min-h-0 sm:h-8 px-3 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
              >
                Dismiss
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditedSeverity(suggestedSeverity);
                  setEditedReason(output?.reason || "");
                  setIsEditing(true);
                }}
                disabled={isDeciding || !canModifySeverity}
                title={!canModifySeverity ? "Requires Manager or Admin role" : undefined}
                leftIcon={<Edit3 className="h-3.5 w-3.5" />}
                className="text-xs min-h-[40px] sm:min-h-0 sm:h-8 px-3"
              >
                Edit
              </Button>

              <Button
                variant="primary"
                size="sm"
                onClick={handleAccept}
                disabled={isDeciding || !canModifySeverity}
                title={!canModifySeverity ? "Requires Manager or Admin role" : undefined}
                leftIcon={<Check className="h-3.5 w-3.5" />}
                className="text-xs min-h-[40px] sm:min-h-0 sm:h-8 px-3"
              >
                {isDeciding ? "Accepting..." : "Accept Severity"}
              </Button>
            </div>
          </div>
        )}

        {/* RBAC notice for developers */}
        {isPendingDecision && !canModifySeverity && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Note: Accepting or editing triage severity requires Incident Manager, Admin, or Super Admin role.
          </p>
        )}

        {actionError && <p className="text-xs text-rose-500">{actionError}</p>}
      </CardContent>
    </Card>
  );
};

export interface AiTriageSummaryMiniCardProps {
  aiStatus?: IncidentAiStatus | null;
  onViewAllAi: () => void;
}

export const AiTriageSummaryMiniCard: React.FC<AiTriageSummaryMiniCardProps> = ({
  aiStatus,
  onViewAllAi,
}) => {
  const triageSuggestion = aiStatus?.suggestions?.triage as AiSuggestion<AiTriageOutput> | undefined;
  const aiSubdoc = aiStatus?.ai;
  const output = triageSuggestion?.output;
  const isRuleBased =
    triageSuggestion?.model === "rules-engine" || triageSuggestion?.provider === "rules";
  const hasTriage = Boolean(triageSuggestion || (aiSubdoc && aiSubdoc.status !== "none"));
  const suggestedSeverity = (output?.suggestedSeverity || aiSubdoc?.severity) as
    | IncidentPriority
    | undefined;
  const rawConfidence = output?.confidence ?? aiSubdoc?.confidence;
  const confidencePercent =
    typeof rawConfidence === "number" ? Math.round(rawConfidence * 100) : null;
  const rationale = output?.reason || aiSubdoc?.reason;

  return (
    <Card className="border-border-color shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <h3 className="text-sm font-semibold text-main-fg">AI Triage</h3>
            {hasTriage && (
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                  isRuleBased
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300"
                    : "bg-brand-50 text-brand-700 border border-brand-200 dark:bg-brand-950/50 dark:text-brand-300 dark:border-brand-800"
                }`}
              >
                {isRuleBased ? "Rule Match" : "AI-generated"}
              </span>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={onViewAllAi}
            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
            className="text-xs h-7 px-2.5 border-brand-200 text-brand-700 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950/50"
          >
            View all AI
          </Button>
        </div>

        {!hasTriage ? (
          <p className="text-xs text-muted-fg">
            No triage suggestion yet. Open the AI tab to run triage, inspect similar incidents, or view status drafts.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              {suggestedSeverity && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-fg">Suggested:</span>
                  <PriorityBadge priority={suggestedSeverity} size="sm" />
                </div>
              )}
              {confidencePercent !== null && (
                <span className="text-[11px] font-medium text-muted-fg tabular-nums">
                  Confidence: <strong className="text-main-fg">{confidencePercent}%</strong>
                </span>
              )}
              {triageSuggestion?.userDecision &&
                triageSuggestion.userDecision !== AI_USER_DECISION.PENDING && (
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-pill text-muted-fg">
                    {triageSuggestion.userDecision}
                  </span>
                )}
            </div>
            {rationale && (
              <p className="text-xs text-muted-fg line-clamp-2 leading-relaxed">
                {rationale}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AiTriageCard;
