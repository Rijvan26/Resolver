import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useDeleteCommentMutation } from "@/features/incidents/commentsApi";
import { parseApiError } from "@/lib/apiErrors";
import { Trash2, AlertTriangle } from "lucide-react";

export interface DeleteCommentModalProps {
  incidentId: string;
  commentId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const DeleteCommentModal: React.FC<DeleteCommentModalProps> = ({
  incidentId,
  commentId,
  isOpen,
  onClose,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteComment, { isLoading }] = useDeleteCommentMutation();

  const handleDelete = async () => {
    setServerError(null);

    try {
      await deleteComment({ incidentId, commentId }).unwrap();
      onClose();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Comment"
      description="This comment will be permanently removed"
      size="sm"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" title="Delete Error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Are you sure you want to delete this comment?</p>
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              This action cannot be undone and will record a comment deletion in the audit timeline.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isLoading}
            disabled={isLoading}
            onClick={handleDelete}
            leftIcon={<Trash2 className="h-4 w-4" />}
          >
            {isLoading ? "Deleting..." : "Delete Comment"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteCommentModal;

