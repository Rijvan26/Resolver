import React, { useState } from "react";
import { useListCommentsQuery } from "@/features/incidents/commentsApi";
import { useAppSelector } from "@/app/hooks";
import { CommentItem } from "./CommentItem";
import { CommentInput } from "./CommentInput";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { MessageSquare, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

export interface CommentListProps {
  incidentId: string;
}

export const CommentList: React.FC<CommentListProps> = ({ incidentId }) => {
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const { user } = useAppSelector((state) => state.auth);

  const { data, isLoading, isFetching, isError, refetch } = useListCommentsQuery({
    incidentId,
    page,
    limit: 20,
    sortOrder,
  });

  const comments = data?.data?.comments || [];
  const pagination = data?.data?.pagination;
  const totalComments = pagination?.total || 0;

  const toggleSortOrder = () => {
    setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between pb-2 border-b border-border-color">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="text-sm font-semibold text-main-fg">
            Discussion & Updates
          </h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {totalComments}
          </span>
        </div>

        {totalComments > 0 && (
          <button
            type="button"
            onClick={toggleSortOrder}
            className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-muted-fg dark:hover:text-slate-200 transition-colors"
          >
            <ArrowUpDown className="h-3 w-3" />
            <span>{sortOrder === "asc" ? "Oldest First" : "Newest First"}</span>
          </button>
        )}
      </div>

      {/* Comment Input Card */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <CommentInput incidentId={incidentId} />
      </div>

      {/* Comments Listing */}
      {isLoading ? (
        <div className="space-y-3 pt-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <p>Failed to load comments.</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
            Retry
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <div className="py-6">
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
              <span className="text-slate-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} comments)
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  className="h-7 text-xs px-2"
                >
                  <ChevronLeft className="h-3.5 w-3.5" /> Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.totalPages || isFetching}
                  onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                  className="h-7 text-xs px-2"
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
};

export default CommentList;

