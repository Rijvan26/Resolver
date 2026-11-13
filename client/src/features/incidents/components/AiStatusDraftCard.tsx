import React, { useState, useEffect } from "react";
import {
  AiSuggestion,
  AI_USER_DECISION,
} from "@/types";
import {
  useTriggerStatusDraftMutation,
  useRecordDecisionMutation,
  AiStatusDraftOutput,
} from "../aiApi";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Copy,
  Check,
  Send,
  X,
  FileEdit,
  Globe,
  Lock,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface AiStatusDraftCardProps {
  incidentId: string;
  statusDraftSuggestion?: AiSuggestion<AiStatusDraftOutput> | null;
}

export const AiStatusDraftCard: React.FC<AiStatusDraftCardProps> = ({
  incidentId,
  statusDraftSuggestion,
}) => {
  const [audience, setAudience] = useState<"internal" | "customer">("internal");
  const [draftContent, setDraftContent] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [triggerStatusDraft, { isLoading: isGenerating }] =
    useTriggerStatusDraftMutation();
  const [recordDecision, { isLoading: isDeciding }] =
    useRecordDecisionMutation();

  const suggestionOutput = statusDraftSuggestion?.output;
  const isPending =
    statusDraftSuggestion &&
    statusDraftSuggestion.userDecision === AI_USER_DECISION.PENDING;

  // Initialize draft text when suggestion arrives
  useEffect(() => {
    if (suggestionOutput?.draftText) {
      setDraftContent(suggestionOutput.draftText);
      if (suggestionOutput.audience) {
        setAudience(suggestionOutput.audience);
      }
    }
  }, [suggestionOutput]);

  const handleGenerate = async (targetAudience: "internal" | "customer") => {
    setActionError(null);
    try {
      const res = await triggerStatusDraft({
        incidentId,
        audience: targetAudience,
      }).unwrap();
      if (res.data?.output?.draftText) {
        setDraftContent(res.data.output.draftText);
      }
    } catch (err: unknown) {
      setActionError(
        (err as { data?: { message?: string } })?.data?.message ||
        "Failed to generate status draft"
      );
    }
  };

  const handleCopy = () => {
    if (!draftContent) return;
    navigator.clipboard.writeText(draftContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAccept = async () => {
    if (!statusDraftSuggestion) return;
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: statusDraftSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.ACCEPTED,
        editedOutput:
          draftContent !== suggestionOutput?.draftText
            ? { draftText: draftContent, audience }
            : undefined,
      }).unwrap();
    } catch (err: unknown) {
      setActionError(
        (err as { data?: { message?: string } })?.data?.message ||
        "Failed to record decision"
      );
    }
  };

  const handleDismiss = async () => {
    if (!statusDraftSuggestion) return;
    setActionError(null);
    try {
      await recordDecision({
        suggestionId: statusDraftSuggestion._id,
        incidentId,
        decision: AI_USER_DECISION.DISMISSED,
      }).unwrap();
    } catch (err: unknown) {
      setActionError(
        (err as { data?: { message?: string } })?.data?.message ||
        "Failed to dismiss draft"
      );
    }
  };

  return (
    <Card className="border border-border-color bg-card-bg shadow-sm rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400">
              <FileEdit className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-main-fg">
                Status Update Draft
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/50">
                <Sparkles className="h-2.5 w-2.5" />
                AI-generated
              </span>
            </div>
          </div>

          {/* Audience Selector Tabs */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => {
                setAudience("internal");
                if (draftContent && suggestionOutput?.audience !== "internal") {
                  handleGenerate("internal");
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${audience === "internal"
                  ? "bg-white text-main-fg shadow-sm dark:bg-slate-700"
                  : "text-muted-fg hover:text-main-fg"
                }`}
            >
              <Lock className="h-3 w-3" />
              Internal
            </button>
            <button
              type="button"
              onClick={() => {
                setAudience("customer");
                if (draftContent && suggestionOutput?.audience !== "customer") {
                  handleGenerate("customer");
                }
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${audience === "customer"
                  ? "bg-white text-main-fg shadow-sm dark:bg-slate-700"
                  : "text-muted-fg hover:text-main-fg"
                }`}
            >
              <Globe className="h-3 w-3" />
              Public Status
            </button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pt-0 text-xs">
        {actionError && (
          <div className="flex items-center gap-1.5 rounded-md bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {draftContent ? (
          <div className="space-y-2.5">
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-slate-300 bg-white p-3 text-xs leading-relaxed text-main-fg focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-900"
              placeholder="Review or edit status draft here..."
            />

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] text-muted-fg italic">
                {audience === "customer"
                  ? "Strict public rules applied: internal IPs, root-cause guesses, and unverified ETAs excluded."
                  : "Internal engineering summary based on recorded timeline and activities."}
              </span>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  leftIcon={
                    copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )
                  }
                  className="h-8 px-3 text-xs rounded-xl border-border-color bg-card-bg shadow-2xs"
                >
                  {copied ? "Copied" : "Copy Draft"}
                </Button>

                {isPending && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAccept}
                      disabled={isDeciding}
                      leftIcon={<Check className="h-3.5 w-3.5" />}
                      className="h-8 px-3.5 text-xs rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-xs"
                    >
                      Accept Draft
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleDismiss}
                      disabled={isDeciding}
                      leftIcon={<X className="h-3.5 w-3.5" />}
                      className="h-8 px-3 text-xs rounded-xl text-muted-fg hover:text-main-fg"
                      title="Dismiss status draft"
                    >
                      Dismiss
                    </Button>
                  </>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleGenerate(audience)}
                  disabled={isGenerating}
                  className="h-8 w-8 p-0 text-xs text-muted-fg hover:text-main-fg rounded-xl"
                  title="Regenerate draft"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isGenerating ? "animate-spin" : ""}`}
                  />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-dashed border-border-color p-4 bg-slate-50/50 dark:bg-slate-900/30">
            <div>
              <p className="font-semibold text-main-fg text-xs sm:text-sm">
                No active status draft for this incident
              </p>
              <p className="mt-0.5 text-xs text-muted-fg">
                Generate an AI-drafted update for {audience === "customer" ? "external users" : "internal responders"}.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleGenerate(audience)}
              disabled={isGenerating}
              leftIcon={
                isGenerating ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-brand-600" />
                ) : (
                  <Send className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
                )
              }
              className="h-9 px-4 text-xs font-semibold rounded-xl shrink-0 border-border-color bg-card-bg hover:border-brand-500 hover:text-brand-600 transition-colors shadow-2xs"
            >
              {isGenerating ? "Generating..." : "Generate Draft"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

