import React, { useState } from "react";
import { Comment, Role } from "@/types";
import { useUpdateCommentMutation } from "@/features/incidents/commentsApi";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { DeleteCommentModal } from "./DeleteCommentModal";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import { Edit2, Trash2, Check, X } from "lucide-react";

export interface CommentItemProps {
  comment: Comment;
  incidentId: string;
  currentUserId?: string;
  currentUserRole?: Role;
}

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

  const [updateComment, { isLoading: isUpdating }] = useUpdateCommentMutation();

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
      <div className="group rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900/90">
        <div className="flex items-start justify-between gap-3">
          {/* Left: Author Avatar & Meta */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold text-main-fg">
                  {author?.name || "Unknown User"}
                </span>
                {author?.role && <RoleBadge role={author.role} size="sm" />}
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

          {/* Right: Actions */}
          {!isEditing && (canEdit || canDelete) && (
            <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
              {canEdit && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="rounded p-1 text-muted-fg hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
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
                  className="rounded p-1 text-muted-fg hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 transition-colors"
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
        <div className="mt-3">
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
                className="text-xs"
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
                    className="h-7 text-xs px-2.5"
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

