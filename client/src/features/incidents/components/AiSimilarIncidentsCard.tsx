import React from "react";
import { Link } from "react-router-dom";
import { useGetSimilarIncidentsQuery } from "../aiApi";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IncidentPriority } from "@/types";
import {
  Sparkles,
  Layers,
  ExternalLink,
  Info,
  RefreshCw,
  Server,
} from "lucide-react";

interface AiSimilarIncidentsCardProps {
  incidentId: string;
}

export const AiSimilarIncidentsCard: React.FC<AiSimilarIncidentsCardProps> = ({
  incidentId,
}) => {
  const { data, isLoading, isFetching, error, refetch } =
    useGetSimilarIncidentsQuery(incidentId);

  const result = data?.data;
  const isAvailable = result?.available ?? false;
  const items = result?.similarIncidents ?? [];

  return (
    <Card className="border border-slate-200/80 shadow-sm dark:border-slate-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-main-fg">
                  Similar Past Incidents
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/50">
                  <Sparkles className="h-2.5 w-2.5" />
                  AI-generated
                </span>
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="h-7 px-2 text-xs text-muted-fg hover:text-main-fg"
            title="Refresh similarity search"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3 pt-1">
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-16 w-full rounded-md" />
          </div>
        ) : error || !isAvailable ? (
          <div className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/60 p-3 text-xs text-muted-fg dark:border-slate-800 dark:bg-slate-900/40">
            <Info className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-main-fg">
                Similar incidents unavailable
              </p>
              <p className="mt-0.5 text-slate-500 dark:text-slate-400">
                {result?.reason ||
                  "Embeddings have not been generated yet or the embedding provider is offline."}
              </p>
            </div>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-200 p-4 text-xs text-muted-fg dark:border-slate-800">
            <Info className="h-4 w-4 text-slate-400 shrink-0" />
            <span>
              No similar past resolved incidents found above the similarity
              threshold.
            </span>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((sim) => {
              const scorePercent = Math.min(
                100,
                Math.max(0, Math.round(sim.similarityScore * 100))
              );

              return (
                <div
                  key={sim.incidentId}
                  className="group relative rounded-lg border border-slate-200/90 bg-slate-50/40 p-3.5 transition-all hover:border-brand-500/40 hover:bg-slate-50/80 dark:border-slate-800/80 dark:bg-slate-900/30 dark:hover:border-brand-400/30 dark:hover:bg-slate-900/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/incidents/${sim.incidentId}`}
                          className="font-medium text-xs text-main-fg hover:text-brand-600 dark:hover:text-brand-400 line-clamp-1 group-hover:underline flex items-center gap-1"
                        >
                          {sim.title}
                          <ExternalLink className="h-3 w-3 opacity-60 inline shrink-0" />
                        </Link>
                        {sim.service && (
                          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <Server className="h-2.5 w-2.5" />
                            {sim.service}
                          </span>
                        )}
                        {sim.finalSeverity && (
                          <PriorityBadge
                            priority={sim.finalSeverity as IncidentPriority}
                            size="sm"
                          />
                        )}
                      </div>

                      {/* Resolution Snippet */}
                      {sim.resolutionNotes && (
                        <p className="mt-1.5 text-[11px] leading-relaxed text-muted-fg line-clamp-2">
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            Resolution:
                          </span>{" "}
                          {sim.resolutionNotes}
                        </p>
                      )}
                    </div>

                    {/* Similarity Score: Text + Bar (not color alone) */}
                    <div className="shrink-0 text-right w-24">
                      <div className="flex items-center justify-end gap-1 text-[11px] font-semibold text-main-fg">
                        <span>{scorePercent}%</span>
                        <span className="text-[10px] text-muted-fg font-normal">
                          match
                        </span>
                      </div>
                      <div
                        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                        role="progressbar"
                        aria-valuenow={scorePercent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Similarity score ${scorePercent}%`}
                      >
                        <div
                          className="h-full rounded-full bg-indigo-600 transition-all dark:bg-indigo-400"
                          style={{ width: `${scorePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
