import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Invitation } from "@/types";
import { useRevokeInvitationMutation } from "@/features/invitations/invitationsApi";
import { parseApiError } from "@/lib/apiErrors";
import { Trash2, AlertTriangle } from "lucide-react";

export interface RevokeInvitationModalProps {
  invitation: Invitation | null;
  isOpen: boolean;
  onClose: () => void;
}

export const RevokeInvitationModal: React.FC<RevokeInvitationModalProps> = ({
  invitation,
  isOpen,
  onClose,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [revokeInvitation, { isLoading }] = useRevokeInvitationMutation();

  const handleRevoke = async () => {
    if (!invitation) return;
    setServerError(null);

    try {
      await revokeInvitation(invitation.id).unwrap();
      onClose();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  if (!invitation) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Revoke Invitation"
      description="Cancel pending invitation"
      size="sm"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
          <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Are you sure you want to revoke this invitation?</p>
            <p className="text-[11px] text-rose-700 dark:text-rose-300">
              The pending invitation for <strong className="font-semibold">{invitation.email}</strong> will be invalidated immediately and cannot be accepted.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isLoading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            isLoading={isLoading}
            disabled={isLoading}
            onClick={handleRevoke}
            leftIcon={<Trash2 className="h-4 w-4" />}
            className="text-xs"
          >
            {isLoading ? "Revoking..." : "Revoke Invitation"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default RevokeInvitationModal;

