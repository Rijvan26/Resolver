import React, { useState, useEffect } from "react";
import { Incident } from "@/types";
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

  const handleSave = async () => {
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

  const members = membersData?.data?.members || [];
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

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <span className="font-semibold text-slate-800 dark:text-slate-100">Incident:</span>{" "}
          {incident.title}
        </div>

        <Select
          label="Assignee"
          value={selectedAssignee}
          onChange={(e) => setSelectedAssignee(e.target.value)}
          disabled={isPending}
          helperText="Only active members of your organization can be assigned"
        >
          <option value="">-- Unassigned --</option>
          {members.map((member) => (
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
              disabled={isPending}
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
              disabled={isPending}
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

