import React, { useState } from "react";
import { Comment, Role } from "@/types";
import {
  useUpdateCommentMutation,
  useListRepliesQuery,
} from "@/features/incidents/commentsApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { DeleteCommentModal } from "./DeleteCommentModal";
import { CommentInput } from "./CommentInput";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import {
  Edit2,
  Trash2,
  Check,
  X,
  Reply,
  MessageSquare,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface CommentItemProps {
  comment: Comment;
  incidentId: string;
  currentUserId?: string;
  currentUserRole?: Role;
}

const formatRole = (role?: string) => {
  if (!role) return "";
  switch (role) {
    case "SUPER_ADMIN":
      return "Super Admin";
    case "ADMIN":
      return "Admin";
    case "MANAGER":
      return "Manager";
    case "DEVELOPER":
      return "Developer";
    default:
      return role;
  }
};

export const CommentItem: React.FC<CommentItemProps> = ({
  comment,
  incidentId,
  currentUserId,
  currentUserRole,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Thread reply states (only applicable for top-level comments)
  const isTopLevel = !comment.parentId;
  const [isReplying, setIsReplying] = useState(false);
  const [isRepliesExpanded, setIsRepliesExpanded] = useState(true);

  const [updateComment, { isLoading: isUpdating }] = useUpdateCommentMutation();

  // Fetch replies if this is a top-level comment
  const { data: repliesData } = useListRepliesQuery(
    { incidentId, commentId: comment.id },
    { skip: !isTopLevel }
  );

  const replies = repliesData?.data || [];
  const replyCount = replies.length;

  const author = comment.author;
  const isAuthor = Boolean(currentUserId && currentUserId === author?.id);
  const isAdmin = currentUserRole === "SUPER_ADMIN" || currentUserRole === "ADMIN";
  const canEdit = isAuthor;
  const canDelete = isAuthor || isAdmin;

  const isEdited =
    comment.updatedAt &&
    comment.createdAt &&
    new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;

  const handleStartEdit = () => {
    setEditContent(comment.content);
    setEditError(null);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setEditContent(comment.content);
    setEditError(null);
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError("Comment cannot be empty");
      return;
    }
    if (trimmed.length > 5000) {
      setEditError("Comment cannot exceed 5000 characters");
      return;
    }

    setEditError(null);
    try {
      await updateComment({
        incidentId,
        commentId: comment.id,
        content: trimmed,
      }).unwrap();
      setIsEditing(false);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setEditError(parsed.message);
    }
  };

  const initials = author?.name
    ? author.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  return (
    <>
      <div
        className={`group rounded-2xl border border-border-color bg-card-bg p-4 shadow-xs transition-all max-w-full overflow-hidden [overflow-wrap:anywhere] ${
          comment.parentId ? "bg-slate-50/40 dark:bg-slate-900/40" : ""
        }`}
      >
        {/* Comment Header: Author, Role Badge, Time, Actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex shrink-0 items-center justify-center rounded-full font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 ${
                comment.parentId
                  ? "h-6 w-6 text-[10px] bg-brand-50"
                  : "h-8 w-8 text-xs bg-brand-100"
              }`}
            >
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-main-fg">
                  {author?.name || "Unknown User"}
                </span>
                {author?.role && (
                  <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                    {formatRole(author.role)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-fg mt-0.5">
                <span title={new Date(comment.createdAt).toLocaleString()}>
                  {formatRelativeTime(comment.createdAt)}
                </span>
                {isEdited && (
                  <>
                    <span>•</span>
                    <span
                      className="italic text-muted-fg"
                      title={new Date(comment.updatedAt).toLocaleString()}
                    >
                      (edited)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action Icons: Edit & Delete */}
          {!isEditing && (canEdit || canDelete) && (
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="rounded p-1.5 text-muted-fg hover:bg-pill hover:text-main-fg transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Edit comment"
                  aria-label="Edit comment"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setIsDeleteOpen(true)}
                  className="rounded p-1.5 text-muted-fg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                  title="Delete comment"
                  aria-label="Delete comment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Comment Body / Editing State */}
        <div className="mt-2.5">
          {isEditing ? (
            <div className="space-y-2">
              {editError && (
                <Alert variant="error" onDismiss={() => setEditError(null)}>
                  {editError}
                </Alert>
              )}
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={3}
                placeholder="Edit your comment..."
                className="text-xs rounded-xl"
                disabled={isUpdating}
                autoFocus
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[10px] text-muted-fg">
                  {editContent.length} / 5000 characters
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isUpdating}
                    className="h-7 text-xs px-2"
                  >
                    <X className="h-3 w-3 mr-1" /> Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    isLoading={isUpdating}
                    disabled={isUpdating || !editContent.trim()}
                    onClick={handleSaveEdit}
                    className="h-7 text-xs px-2.5 bg-brand-600 hover:bg-brand-700"
                  >
                    <Check className="h-3 w-3 mr-1" /> Save
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-main-fg">
              {comment.content}
            </div>
          )}
        </div>

        {/* Reply Toolbar (Top-Level Comments Only) */}
        {isTopLevel && !isEditing && (
          <div className="mt-3 pt-2 border-t border-border-color flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsReplying((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-fg hover:text-brand-600 dark:hover:text-brand-400 transition-colors min-h-[36px] py-1 px-2 -ml-2"
            >
              <Reply className="h-3.5 w-3.5" />
              <span>{isReplying ? "Cancel" : "Reply"}</span>
            </button>

            {replyCount > 0 && (
              <button
                type="button"
                onClick={() => setIsRepliesExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-fg hover:text-main-fg transition-colors min-h-[36px] py-1 px-2 -mr-2"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>
                  {replyCount} {replyCount === 1 ? "reply" : "replies"}
                </span>
                {isRepliesExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        )}

        {/* Inline Reply Form */}
        {isTopLevel && isReplying && (
          <div className="mt-3 rounded-xl border border-border-color bg-slate-50/50 p-3 dark:bg-slate-900/40">
            <CommentInput
              incidentId={incidentId}
              parentId={comment.id}
              placeholder={`Reply to ${author?.name || "this comment"}...`}
              submitButtonText="Reply"
              autoFocus
              onSuccess={() => {
                setIsReplying(false);
                setIsRepliesExpanded(true);
              }}
              onCancel={() => setIsReplying(false)}
            />
          </div>
        )}

        {/* Threaded Nested Replies */}
        {isTopLevel && isRepliesExpanded && replyCount > 0 && (
          <div className="mt-3.5 space-y-2.5 border-l-2 border-slate-200 dark:border-slate-800 pl-4 ml-3">
            {replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                incidentId={incidentId}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
              />
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {canDelete && (
        <DeleteCommentModal
          incidentId={incidentId}
          commentId={comment.id}
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
        />
      )}
    </>
  );
};

export default CommentItem;
