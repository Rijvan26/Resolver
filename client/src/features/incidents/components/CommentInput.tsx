import React, { useState } from "react";
import { useCreateCommentMutation } from "@/features/incidents/commentsApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { parseApiError } from "@/lib/apiErrors";
import { Send, X } from "lucide-react";

export interface CommentInputProps {
  incidentId: string;
  parentId?: string;
  placeholder?: string;
  submitButtonText?: string;
  autoFocus?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CommentInput: React.FC<CommentInputProps> = ({
  incidentId,
  parentId,
  placeholder = "Write a comment or provide an incident update...",
  submitButtonText = "Comment",
  autoFocus = false,
  onSuccess,
  onCancel,
}) => {
  const [content, setContent] = useState("");
  const [postTag, setPostTag] = useState<"general" | "update" | "action" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [createComment, { isLoading }] = useCreateCommentMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();

    if (!trimmed) {
      setError("Comment cannot be empty");
      return;
    }

    if (trimmed.length > 5000) {
      setError("Comment cannot exceed 5000 characters");
      return;
    }

    setError(null);

    // Apply tag prefix if selected and not already in text
    let finalContent = trimmed;
    if (postTag === "update" && !trimmed.toLowerCase().startsWith("[update]")) {
      finalContent = `[Update] ${trimmed}`;
    } else if (postTag === "action" && !trimmed.toLowerCase().startsWith("[action item]")) {
      finalContent = `[Action Item] ${trimmed}`;
    }

    try {
      await createComment({ incidentId, content: finalContent, parentId }).unwrap();
      setContent("");
      setPostTag(null);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setError(parsed.message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <Alert variant="error" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div className="relative">
        <Textarea
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            if (error) setError(null);
          }}
          placeholder={placeholder}
          rows={parentId ? 2 : 3}
          disabled={isLoading}
          autoFocus={autoFocus}
          className="text-xs resize-y min-h-[75px] rounded-xl border border-border-color bg-card-bg p-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-muted-fg">
        <span className="text-[11px] tabular-nums text-muted-fg">
          {content.length} / 5000 characters
        </span>

        <div className="flex flex-wrap items-center gap-3">
          {/* Post Tagging Checkboxes (Image matching) */}
          <div className="flex items-center gap-2.5 text-xs text-main-fg">
            <span className="text-muted-fg text-[11px]">Tag your post:</span>
            <label className="inline-flex items-center gap-1 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={postTag === "general"}
                onChange={() => setPostTag(postTag === "general" ? null : "general")}
                className="rounded border-border-color text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span>General</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={postTag === "update"}
                onChange={() => setPostTag(postTag === "update" ? null : "update")}
                className="rounded border-border-color text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span>Update</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                checked={postTag === "action"}
                onChange={() => setPostTag(postTag === "action" ? null : "action")}
                className="rounded border-border-color text-brand-600 focus:ring-brand-500 h-3.5 w-3.5"
              />
              <span>Action Item</span>
            </label>
          </div>

          {onCancel && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isLoading}
              className="text-xs h-7 px-2"
            >
              <X className="h-3 w-3 mr-1" /> Cancel
            </Button>
          )}

          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={isLoading || !content.trim()}
            leftIcon={<Send className="h-3.5 w-3.5" />}
            className="rounded-xl text-xs h-8 px-3.5 bg-slate-700 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-medium shadow-sm"
          >
            {isLoading ? "Posting..." : submitButtonText}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default CommentInput;
