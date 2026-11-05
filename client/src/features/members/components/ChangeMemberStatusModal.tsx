import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Member, ROLES } from "@/types";
import { useUpdateMemberStatusMutation } from "@/features/members/membersApi";
import { parseApiError } from "@/lib/apiErrors";
import { UserX, UserCheck, AlertTriangle } from "lucide-react";

export interface ChangeMemberStatusModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ChangeMemberStatusModal: React.FC<ChangeMemberStatusModalProps> = ({
  member,
  isOpen,
  onClose,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [updateMemberStatus, { isLoading }] = useUpdateMemberStatusMutation();

  if (!member) return null;

  const willDeactivate = member.isActive;

  const handleToggleStatus = async () => {
    setServerError(null);

    try {
      await updateMemberStatus({
        memberId: member.id,
        isActive: !member.isActive,
      }).unwrap();
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
      title={willDeactivate ? "Deactivate Team Member" : "Reactivate Team Member"}
      description={`Manage account access for ${member.name}`}
      size="sm"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        {willDeactivate ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200">
            <AlertTriangle className="h-5 w-5 text-sev-p1 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Are you sure you want to deactivate this account?</p>
              <p className="text-[11px] text-sev-p1">
                <strong>{member.name}</strong> ({member.email}) will immediately lose access to this organization and cannot log in or participate in incident workflows.
              </p>
              {member.role === ROLES.SUPER_ADMIN && (
                <p className="text-[11px] font-medium text-rose-800 dark:text-rose-200 pt-1">
                  Note: The organization must have at least one other active Super Admin.
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200">
            <UserCheck className="h-5 w-5 text-healthy-text shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Reactivate this account?</p>
              <p className="text-[11px] text-healthy-text">
                <strong>{member.name}</strong> will regain access to log in and collaborate on organization incidents.
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-color">
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
            variant={willDeactivate ? "danger" : "primary"}
            size="sm"
            isLoading={isLoading}
            disabled={isLoading}
            onClick={handleToggleStatus}
            leftIcon={
              willDeactivate ? (
                <UserX className="h-4 w-4" />
              ) : (
                <UserCheck className="h-4 w-4" />
              )
            }
            className="text-xs"
          >
            {isLoading
              ? willDeactivate
                ? "Deactivating..."
                : "Activating..."
              : willDeactivate
              ? "Deactivate Account"
              : "Reactivate Account"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ChangeMemberStatusModal;

