import React, { useState, useEffect } from "react";
import { useAppSelector } from "@/app/hooks";
import { Incident, ROLES, INCIDENT_ASSIGNMENT_PERMISSIONS } from "@/types";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useUpdateAssigneeMutation } from "@/features/incidents/incidentsApi";
import { useGetMembersQuery } from "@/features/members/membersApi";
import { parseApiError } from "@/lib/apiErrors";
import { UserCheck, UserX } from "lucide-react";

export interface AssignIncidentModalProps {
  incident: Incident;
  isOpen: boolean;
  onClose: () => void;
}

export const AssignIncidentModal: React.FC<AssignIncidentModalProps> = ({
  incident,
  isOpen,
  onClose,
}) => {
  const { user } = useAppSelector((state) => state.auth);
  const [selectedAssignee, setSelectedAssignee] = useState<string>(
    incident.assignee?.id || incident.assigneeId || ""
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: membersData, isLoading: isLoadingMembers } = useGetMembersQuery(
    { status: "active", limit: 100 },
    { skip: !isOpen }
  );

  const [updateAssignee, { isLoading: isUpdating }] = useUpdateAssigneeMutation();

  useEffect(() => {
    if (isOpen) {
      setSelectedAssignee(incident.assignee?.id || incident.assigneeId || "");
      setServerError(null);
    }
  }, [isOpen, incident]);

  const allMembers = membersData?.data?.members || [];

  // Filter eligible assignees based on current user's role hierarchy
  const allowedRoles = user?.role ? INCIDENT_ASSIGNMENT_PERMISSIONS[user.role] || [] : [];
  const eligibleMembers = allMembers.filter((m) => allowedRoles.includes(m.role));

  // Check if current user is blocked from reassigning
  const isAssignedToHigherRole =
    user?.role === ROLES.DEVELOPER &&
    incident.assignee &&
    incident.assignee.role !== ROLES.DEVELOPER;

  const currentCreatorId = typeof incident.createdBy === "object" ? incident.createdBy.id : incident.createdBy;
  const isAssignedToOtherDev =
    user?.role === ROLES.DEVELOPER &&
    incident.assignee &&
    incident.assignee.id !== user?.id &&
    currentCreatorId !== user?.id;

  const isReassignmentBlocked = Boolean(isAssignedToHigherRole || isAssignedToOtherDev);

  const handleSave = async () => {
    if (isReassignmentBlocked) return;
    setServerError(null);

    try {
      await updateAssignee({
        id: incident.id,
        data: {
          assigneeId: selectedAssignee ? selectedAssignee : null,
        },
      }).unwrap();

      onClose();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  const isPending = isUpdating || isLoadingMembers;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Assign Incident"
      description={`Delegate responsibility for incident #${incident.id.slice(-6)}`}
      size="md"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" title="Assignment Failed" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        {isAssignedToHigherRole && (
          <Alert
            variant="warning"
            title="Reassignment Restricted"
          >
            This incident is assigned to {incident.assignee?.name} ({incident.assignee?.role}). As a developer, you cannot reassign incidents managed by administrators or managers.
          </Alert>
        )}

        {isAssignedToOtherDev && (
          <Alert
            variant="warning"
            title="Reassignment Restricted"
          >
            This incident is assigned to {incident.assignee?.name}. Only the assigned engineer, incident creator, or managers can reassign it.
          </Alert>
        )}

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">Incident:</span>{" "}
          {incident.title}
        </div>

        <Select
          label="Assignee"
          value={selectedAssignee}
          onChange={(e) => setSelectedAssignee(e.target.value)}
          disabled={isPending || isReassignmentBlocked}
          helperText={
            user?.role === ROLES.DEVELOPER
              ? "As a developer, you can only assign incidents to fellow developers"
              : "Only active members of your organization can be assigned"
          }
        >
          <option value="">-- Unassigned --</option>
          {eligibleMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.email}) — {member.role}
            </option>
          ))}
        </Select>

        <div className="flex items-center justify-between pt-4 border-t border-border-color">
          {selectedAssignee ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelectedAssignee("")}
              disabled={isPending || isReassignmentBlocked}
              leftIcon={<UserX className="h-4 w-4" />}
            >
              Clear Assignee
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              isLoading={isPending}
              disabled={isPending || isReassignmentBlocked}
              onClick={handleSave}
              leftIcon={<UserCheck className="h-4 w-4" />}
            >
              {isUpdating ? "Assigning..." : "Update Assignee"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default AssignIncidentModal;

