import React, { useState } from "react";
import { useCreateCommentMutation } from "@/features/incidents/commentsApi";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert } from "@/components/ui/alert";
import { parseApiError } from "@/lib/apiErrors";
import { Send } from "lucide-react";

export interface CommentInputProps {
  incidentId: string;
}

export const CommentInput: React.FC<CommentInputProps> = ({ incidentId }) => {
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
      await createComment({ incidentId, content: trimmed }).unwrap();
      setContent("");
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
          placeholder="Write a comment or provide an incident update..."
          rows={3}
          disabled={isLoading}
          className="text-xs resize-y min-h-[80px]"
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] text-slate-400">
          {content.length} / 5000 characters
        </span>

        <Button
          type="submit"
          variant="primary"
          size="sm"
          isLoading={isLoading}
          disabled={isLoading || !content.trim()}
          leftIcon={<Send className="h-3.5 w-3.5" />}
          className="text-xs"
        >
          {isLoading ? "Posting..." : "Comment"}
        </Button>
      </div>
    </form>
  );
};

export default CommentInput;

