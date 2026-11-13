import React, { useState, useMemo } from "react";
import { useListCommentsQuery } from "@/features/incidents/commentsApi";
import { useAppSelector } from "@/app/hooks";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Incident } from "@/types";
import {
  MessageSquare,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export interface CommentListProps {
  incidentId: string;
  incident?: Incident | null;
  showSidebar?: boolean;
}

export const CommentList: React.FC<CommentListProps> = ({
  incidentId,
  incident,
  showSidebar = false,
}) => {
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [viewPreference, setViewPreference] = useState(true);
  const { user } = useAppSelector((state) => state.auth);

  const { data, isLoading, isFetching, isError, refetch } = useListCommentsQuery({
    incidentId,
    page,
    limit: 20,
    sortOrder,
  });

  const allComments = data?.data?.comments || [];
  // Render top-level comments at the root (replies are displayed nested in their parent thread)
  const comments = allComments.filter((c) => !c.parentId);
  const pagination = data?.data?.pagination;
  const totalComments = pagination?.total || 0;

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  // Compute real participants without dummy data
  const participants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; email?: string; role?: string }>();

    if (incident?.createdBy) {
      const creator = typeof incident.createdBy === "object" ? incident.createdBy : null;
      if (creator && creator.id) {
        map.set(creator.id, creator);
      }
    }

    if (incident?.assignee && incident.assignee.id) {
      map.set(incident.assignee.id, incident.assignee);
    }

    allComments.forEach((c) => {
      if (c.author && c.author.id && !map.has(c.author.id)) {
        map.set(c.author.id, c.author);
      }
    });

    return Array.from(map.values());
  }, [incident, allComments]);

  const mainDiscussionContent = (
    <div className="rounded-2xl border border-border-color bg-card-bg p-5 sm:p-6 shadow-sm space-y-5">
      {/* Header bar (Matching Image 3) */}
      <div className="flex items-center justify-between pb-3 border-b border-border-color">
        <div className="flex items-center gap-2.5">
          <MessageSquare className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm sm:text-base font-bold text-main-fg">
            Discussion & Updates
          </h3>
          <span className="rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2.5 py-0.5 text-xs font-semibold">
            {totalComments}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleSortOrder}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-fg hover:text-main-fg transition-colors"
        >
          <ArrowUpDown className="h-3 w-3" />
          <span>{sortOrder === "asc" ? "Oldest First" : "Newest First"}</span>
        </button>
      </div>

      {/* Comment Input Card */}
      <div className="rounded-2xl border border-border-color bg-slate-50/40 dark:bg-slate-900/30 p-4">
        <CommentInput incidentId={incidentId} />
      </div>

      {/* Comments Listing */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-4 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <p>Failed to load comments.</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
            Retry
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <div className="py-8">
          <EmptyState
            icon={<MessageSquare className="h-8 w-8 text-slate-300 dark:text-slate-600" />}
            title="No comments yet"
            description="Collaborate and share incident updates with your team."
          />
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              incidentId={incidentId}
              currentUserId={user?.id}
              currentUserRole={user?.role}
            />
          ))}

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 border-t border-border-color text-xs">
              <span className="text-muted-fg">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} comments)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="h-8 text-xs px-2.5 rounded-xl"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="h-8 text-xs px-2.5 rounded-xl"
                >
                  Next <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (!showSidebar) {
    return mainDiscussionContent;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
      {/* Left 3 cols: Main Discussion & Updates Card */}
      <div className="lg:col-span-3">
        {mainDiscussionContent}
      </div>

      {/* Right 1 col: Discussion Sidebar (Pixel-matched with Image 3) */}
      <div className="lg:col-span-1 space-y-6">
        <div className="rounded-2xl border border-border-color bg-card-bg p-5 shadow-sm space-y-6 text-xs">
          {/* Section 1: Incident Info */}
          <div>
            <h4 className="text-xs font-bold text-main-fg mb-1.5">Incident Info</h4>
            <p className="text-xs text-muted-fg leading-relaxed">
              {incident?.description || "Helps hub team prioritize prioritize."}
            </p>
          </div>

          {/* Section 2: Participants */}
          <div className="pt-4 border-t border-border-color">
            <h4 className="text-xs font-bold text-main-fg mb-2.5">Participants</h4>
            {participants.length === 0 ? (
              <span className="text-muted-fg italic text-xs">No active participants yet</span>
            ) : (
              <div className="flex items-center gap-1.5 flex-wrap">
                {participants.map((p) => {
                  const initials = p.name
                    ? p.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                    : "U";
                  return (
                    <div
                      key={p.id}
                      title={`${p.name} (${p.role || "Member"})`}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 font-bold text-xs ring-2 ring-card-bg shadow-2xs select-none"
                    >
                      {initials}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Filter & Sort */}
          <div className="pt-4 border-t border-border-color space-y-3">
            <h4 className="text-xs font-bold text-main-fg">Filter & Sort</h4>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-main-fg font-medium">View preference</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={viewPreference}
                  onChange={(e) => setViewPreference(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-main-fg font-medium">Filter & Sort</span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={sortOrder === "desc"}
                  onChange={(e) => {
                    setSortOrder(e.target.checked ? "desc" : "asc");
                    setPage(1);
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
              </label>
            </div>
          </div>

          {/* Section 4: Incident Details */}
          <div className="pt-4 border-t border-border-color space-y-2">
            <h4 className="text-xs font-bold text-main-fg">Incident Details</h4>
            <div className="text-xs space-y-1">
              <div>
                <span className="text-muted-fg">Status: </span>
                <span className="font-semibold text-sky-600 dark:text-sky-400 capitalize">
                  {incident?.status ? incident.status.toLowerCase().replace("_", " ") : "Open"}
                </span>
              </div>
              <div>
                <span className="text-muted-fg">Priority: </span>
                <span className="font-semibold text-amber-600 dark:text-amber-400 capitalize">
                  {incident?.priority ? incident.priority.toLowerCase() : "Medium"}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-muted-fg leading-relaxed pt-1">
              Summarize badge for context during discussion.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommentList;
