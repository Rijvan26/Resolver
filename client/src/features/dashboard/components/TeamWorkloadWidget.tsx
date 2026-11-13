import React from "react";
import { TeamMemberWorkload } from "@/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Users, AlertCircle, RotateCw } from "lucide-react";

export interface TeamWorkloadWidgetProps {
  data?: {
    teamWorkload: TeamMemberWorkload[];
    totalMembers: number;
  };
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const TeamWorkloadWidget: React.FC<TeamWorkloadWidgetProps> = ({
  data,
  isLoading,
  isError,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-60" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between p-2">
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="h-full border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20">
        <CardHeader>
          <CardTitle>Team Workload Breakdown</CardTitle>
          <CardDescription>Unresolved incident assignments</CardDescription>
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <p className="text-xs text-sev-p1">
            Failed to load team workload data.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            leftIcon={<RotateCw className="h-3.5 w-3.5" />}
          >
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const team = data?.teamWorkload || [];
  const maxWorkload = Math.max(...team.map((t) => t.totalUnresolved), 1);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <Users className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
              <CardTitle className="truncate">Team Workload</CardTitle>
            </div>
            <CardDescription className="truncate">
              Active unresolved incidents per eligible team member
            </CardDescription>
          </div>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border border-slate-200/60 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 text-main-fg tabular-nums shrink-0">
            {team.length} Members
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {team.length === 0 ? (
          <div className="flex h-56 items-center justify-center text-xs text-muted-fg">
            No active team members found in this organization.
          </div>
        ) : (
          <div className="divide-y divide-border-color">
            {team.map((item) => {
              const initials = item.member.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2);

              const percent = Math.min((item.totalUnresolved / maxWorkload) * 100, 100);

              const isHighWorkload = item.totalUnresolved >= 5;
              const isZero = item.totalUnresolved === 0;

              return (
                <div key={item.member.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-main-fg truncate">
                            {item.member.name}
                          </span>
                          <RoleBadge role={item.member.role} size="sm" />
                        </div>
                        <span className="text-[11px] text-muted-fg truncate block">
                          {item.member.email}
                        </span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span
                          className={`text-sm font-bold tabular-nums ${
                            isZero
                              ? "text-muted-fg"
                              : isHighWorkload
                              ? "text-sev-p1"
                              : "text-main-fg"
                          }`}
                        >
                          {item.totalUnresolved}
                        </span>
                        <span className="text-[10px] text-muted-fg">active</span>
                      </div>
                      <div className="text-[11px] text-muted-fg tabular-nums">
                        {item.open} open · {item.inProgress} in prog
                      </div>
                    </div>
                  </div>

                  {/* Workload Progress Bar */}
                  <div className="h-1.5 w-full rounded-full bg-pill overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        isZero
                          ? "bg-emerald-400"
                          : isHighWorkload
                          ? "bg-rose-500"
                          : item.totalUnresolved > 2
                          ? "bg-amber-500"
                          : "bg-brand-500"
                      }`}
                      style={{ width: isZero ? "4%" : `${percent}%` }}
                    />
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

export default TeamWorkloadWidget;

