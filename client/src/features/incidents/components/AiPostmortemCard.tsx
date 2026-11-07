import React, { useState } from "react";
import {
  IncidentAiStatus,
  AiSuggestion,
  AiPostmortemOutput,
  IncidentStatus,
  INCIDENT_STATUS,
} from "@/types";
import { useTriggerPostmortemMutation } from "../aiApi";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { parseApiError } from "@/lib/apiErrors";
import {
  FileCode2,
  Copy,
  Check,
  RefreshCw,
  ListChecks,
  Lightbulb,
  FileCheck2,
} from "lucide-react";

interface AiPostmortemCardProps {
  incidentId: string;
  incidentStatus: IncidentStatus;
  aiStatus?: IncidentAiStatus | null;
}

export const AiPostmortemCard: React.FC<AiPostmortemCardProps> = ({
  incidentId,
  incidentStatus,
  aiStatus,
}) => {
  const [triggerPostmortem, { isLoading: isDrafting }] = useTriggerPostmortemMutation();
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Resolution Guard: Do not render postmortem for unresolved incidents
  const isResolvedOrClosed =
    incidentStatus === INCIDENT_STATUS.RESOLVED || incidentStatus === INCIDENT_STATUS.CLOSED;

  if (!isResolvedOrClosed) {
    return null;
  }

  const postmortemSuggestion = aiStatus?.suggestions?.postmortem as
    | AiSuggestion<AiPostmortemOutput>
    | undefined;

  const output = postmortemSuggestion?.output;

  const handleGenerate = async () => {
    setErrorMsg(null);
    try {
      await triggerPostmortem(incidentId).unwrap();
    } catch (err) {
      setErrorMsg(parseApiError(err).message);
    }
  };

  const handleCopyMarkdown = () => {
    if (!output) return;

    const markdownText = `# ${output.title || "Incident Postmortem Draft"}

## Root Cause
${output.rootCause}

${output.impact ? `## Impact\n${output.impact}\n` : ""}
${output.timelineSummary ? `## Timeline Summary\n${output.timelineSummary}\n` : ""}
## Action Items
${output.actionItems?.map((item) => `- [ ] ${item}`).join("\n") || "None specified"}

## Lessons Learned
${output.lessonsLearned?.map((item) => `- ${item}`).join("\n") || "None specified"}
`;

    navigator.clipboard.writeText(markdownText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800/80 shadow-sm overflow-hidden">
      <CardHeader className="bg-slate-50/70 dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800/60 py-3.5 px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              <FileCheck2 className="h-3.5 w-3.5" />
            </span>
            <CardTitle className="text-sm font-semibold text-main-fg">
              Blameless Postmortem Draft
            </CardTitle>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-fg bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              AI-Generated Draft
            </span>
          </div>

          {output && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyMarkdown}
                leftIcon={copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                className="text-xs h-7 px-2.5"
              >
                {copied ? "Copied Markdown!" : "Copy Postmortem"}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isDrafting}
                leftIcon={<RefreshCw className={`h-3 w-3 ${isDrafting ? "animate-spin" : ""}`} />}
                className="text-xs h-7 px-2"
              >
                {isDrafting ? "Drafting..." : "Re-draft"}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {output ? (
          <>
            {/* Root Cause */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-fg block">
                Technical Root Cause
              </span>
              <p className="text-xs text-main-fg leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-3 rounded-md border border-slate-100 dark:border-slate-800/60">
                {output.rootCause}
              </p>
            </div>

            {/* Timeline Summary if available */}
            {output.timelineSummary && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-fg block">
                  Incident Timeline Synopsis
                </span>
                <p className="text-xs text-main-fg leading-relaxed bg-slate-50 dark:bg-slate-900/40 p-3 rounded-md border border-slate-100 dark:border-slate-800/60 whitespace-pre-wrap">
                  {output.timelineSummary}
                </p>
              </div>
            )}

            {/* Action Items & Lessons Learned Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* Action Items */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-main-fg">
                  <ListChecks className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Action Items</span>
                </div>
                {output.actionItems && output.actionItems.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-main-fg list-inside">
                    {output.actionItems.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/30 p-2 rounded border border-slate-100 dark:border-slate-800/40">
                        <span className="text-muted-fg text-[11px] font-mono mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-fg italic">No action items specified.</p>
                )}
              </div>

              {/* Lessons Learned */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-main-fg">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                  <span>Lessons Learned</span>
                </div>
                {output.lessonsLearned && output.lessonsLearned.length > 0 ? (
                  <ul className="space-y-1.5 text-xs text-main-fg list-inside">
                    {output.lessonsLearned.map((lesson, idx) => (
                      <li key={idx} className="flex items-start gap-2 bg-slate-50 dark:bg-slate-900/30 p-2 rounded border border-slate-100 dark:border-slate-800/40">
                        <span className="text-muted-fg text-[11px] font-mono mt-0.5">•</span>
                        <span>{lesson}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-fg italic">No lessons captured.</p>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="py-4 text-center space-y-2">
            <p className="text-xs text-muted-fg max-w-md mx-auto">
              This incident is resolved. Draft a blameless postmortem analyzing systemic factors, root cause, and engineering action items.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isDrafting}
              leftIcon={
                isDrafting ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <FileCode2 className="h-3.5 w-3.5" />
                )
              }
              className="text-xs"
            >
              {isDrafting ? "Drafting Postmortem..." : "Draft Blameless Postmortem"}
            </Button>
          </div>
        )}

        {errorMsg && <p className="text-xs text-rose-500 pt-1">{errorMsg}</p>}
      </CardContent>
    </Card>
  );
};

export default AiPostmortemCard;
