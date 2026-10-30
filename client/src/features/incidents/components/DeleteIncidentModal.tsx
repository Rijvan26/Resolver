import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useDeleteIncidentMutation } from "@/features/incidents/incidentsApi";
import { parseApiError } from "@/lib/apiErrors";
import { Trash2, AlertTriangle } from "lucide-react";

export interface DeleteIncidentModalProps {
  incidentId: string;
  incidentTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const DeleteIncidentModal: React.FC<DeleteIncidentModalProps> = ({
  incidentId,
  incidentTitle,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [deleteIncident, { isLoading }] = useDeleteIncidentMutation();

  const handleDelete = async () => {
    setServerError(null);

    try {
      await deleteIncident(incidentId).unwrap();
      onClose();
      onSuccess();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete Incident"
      description="This action cannot be undone"
      size="sm"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" title="Deletion Error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Are you sure you want to delete this incident?</p>
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              "{incidentTitle}" and all its historical audit logs will be permanently deleted from
              your organization.
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
            {isLoading ? "Deleting..." : "Permanently Delete"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteIncidentModal;

