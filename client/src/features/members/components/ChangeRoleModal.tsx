import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Member, Role, ROLES, MEMBER_ROLE_ASSIGNMENT_PERMISSIONS } from "@/types";
import { useUpdateMemberRoleMutation } from "@/features/members/membersApi";
import { parseApiError } from "@/lib/apiErrors";
import { AlertTriangle, Check } from "lucide-react";

export interface ChangeRoleModalProps {
  member: Member | null;
  isOpen: boolean;
  onClose: () => void;
  actorRole: Role;
}

export const ChangeRoleModal: React.FC<ChangeRoleModalProps> = ({
  member,
  isOpen,
  onClose,
  actorRole,
}) => {
  const allowedRoles = MEMBER_ROLE_ASSIGNMENT_PERMISSIONS[actorRole] || [];
  const [selectedRole, setSelectedRole] = useState<Role>(
    member ? member.role : (allowedRoles[0] || ("DEVELOPER" as Role))
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const [updateMemberRole, { isLoading }] = useUpdateMemberRoleMutation();

  useEffect(() => {
    if (member) {
      setSelectedRole(member.role);
      setServerError(null);
    }
  }, [member]);

  const handleUpdateRole = async () => {
    if (!member || selectedRole === member.role) return;
    setServerError(null);

    try {
      await updateMemberRole({
        memberId: member.id,
        role: selectedRole,
      }).unwrap();
      onClose();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  if (!member) return null;

  const isDemotingSuperAdmin =
    member.role === ROLES.SUPER_ADMIN && selectedRole !== ROLES.SUPER_ADMIN;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Change Member Role"
      description="Update organizational access level"
      size="md"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        {/* Member profile summary */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
          <div>
            <div className="font-semibold text-main-fg">
              {member.name}
            </div>
            <div className="text-[11px] text-slate-500">{member.email}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-fg">Current:</span>
            <RoleBadge role={member.role} size="sm" />
          </div>
        </div>

        {/* Role Select */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-main-fg">
            Select New Role
          </label>
          <Select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as Role)}
            disabled={isLoading}
          >
            {allowedRoles.map((role) => (
              <option key={role} value={role}>
                {role.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>

        {/* Warning if demoting Super Admin */}
        {isDemotingSuperAdmin && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 text-sev-p3 shrink-0 mt-0.5" />
            <p className="text-[11px]">
              <strong>Caution:</strong> You are changing the role of a Super Admin. An organization must retain at least one active Super Admin at all times.
            </p>
          </div>
        )}

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-900/40">
          Role changes modify system permissions immediately, including incident creation, assignment rights, and administrative capabilities.
        </div>

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
            variant="primary"
            size="sm"
            isLoading={isLoading}
            disabled={isLoading || selectedRole === member.role}
            onClick={handleUpdateRole}
            leftIcon={<Check className="h-3.5 w-3.5" />}
            className="text-xs"
          >
            {isLoading ? "Saving..." : "Update Role"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ChangeRoleModal;

