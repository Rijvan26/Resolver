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

    try {
      await createComment({ incidentId, content: trimmed, parentId }).unwrap();
      setContent("");
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
          className="text-xs resize-y min-h-[60px]"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-muted-fg">
          {content.length} / 5000 characters
        </span>

        <div className="flex items-center gap-2">
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
            className="text-xs h-7 px-2.5"
          >
            {isLoading ? "Posting..." : submitButtonText}
          </Button>
        </div>
      </div>
    </form>
  );
};

export default CommentInput;
