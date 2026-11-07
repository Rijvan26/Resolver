import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppSelector } from "@/app/hooks";
import {
  Incident,
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  ROLES,
  INCIDENT_PRIORITY_UPDATE_ROLES,
  INCIDENT_CLOSE_ROLES,
} from "@/types";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useUpdateIncidentMutation } from "@/features/incidents/incidentsApi";
import { updateIncidentFormSchema, UpdateIncidentFormValues } from "@/features/incidents/schemas";
import { parseApiError } from "@/lib/apiErrors";
import { Save } from "lucide-react";

export interface EditIncidentModalProps {
  incident: Incident;
  isOpen: boolean;
  onClose: () => void;
}

export const EditIncidentModal: React.FC<EditIncidentModalProps> = ({
  incident,
  isOpen,
  onClose,
}) => {
  const { user } = useAppSelector((state) => state.auth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [updateIncident, { isLoading }] = useUpdateIncidentMutation();

  const canChangePriority = Boolean(user && INCIDENT_PRIORITY_UPDATE_ROLES.includes(user.role));
  const canCloseIncident = Boolean(user && INCIDENT_CLOSE_ROLES.includes(user.role));

  const isAssignee = incident.assignee?.id === user?.id || incident.assigneeId === user?.id;
  const creatorId = typeof incident.createdBy === "object" ? incident.createdBy.id : incident.createdBy;
  const isCreator = creatorId === user?.id;

  const canEditDetails = user?.role !== ROLES.DEVELOPER || isAssignee || isCreator;
  const canEditStatus = user?.role !== ROLES.DEVELOPER || isAssignee || isCreator;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateIncidentFormValues>({
    resolver: zodResolver(updateIncidentFormSchema),
    defaultValues: {
      title: incident.title,
      description: incident.description,
      status: incident.status,
      priority: incident.priority,
    },
  });

  useEffect(() => {
    if (isOpen) {
      reset({
        title: incident.title,
        description: incident.description,
        status: incident.status,
        priority: incident.priority,
      });
      setServerError(null);
    }
  }, [isOpen, incident, reset]);

  const onSubmit = async (values: UpdateIncidentFormValues) => {
    setServerError(null);

    try {
      await updateIncident({
        id: incident.id,
        data: values,
      }).unwrap();

      onClose();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);

      if (parsed.fieldErrors) {
        Object.entries(parsed.fieldErrors).forEach(([field, msg]) => {
          if (
            field === "title" ||
            field === "description" ||
            field === "status" ||
            field === "priority"
          ) {
            setError(field as keyof UpdateIncidentFormValues, { message: msg });
          }
        });
      }
    }
  };

  const isPending = isLoading || isSubmitting;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Incident"
      description={`Update incident details and severity classification`}
      size="lg"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" title="Update Failed" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        <Input
          label="Title"
          placeholder="Brief summary of the incident"
          disabled={isPending || !canEditDetails}
          error={errors.title?.message}
          helperText={!canEditDetails ? "Only the assigned engineer, creator, or managers can edit title" : undefined}
          {...register("title")}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Status"
            disabled={isPending || !canEditStatus}
            error={errors.status?.message}
            helperText={!canEditStatus ? "Only the assigned engineer or managers can update status" : undefined}
            {...register("status")}
          >
            <option value={INCIDENT_STATUS.OPEN}>Open</option>
            <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress</option>
            <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
            {canCloseIncident && <option value={INCIDENT_STATUS.CLOSED}>Closed</option>}
          </Select>

          <Select
            label="Priority"
            disabled={isPending || !canChangePriority}
            error={errors.priority?.message}
            helperText={!canChangePriority ? "Severity changes require Incident Manager or Admin role" : undefined}
            {...register("priority")}
          >
            <option value={INCIDENT_PRIORITY.LOW}>Low</option>
            <option value={INCIDENT_PRIORITY.MEDIUM}>Medium</option>
            <option value={INCIDENT_PRIORITY.HIGH}>High</option>
            <option value={INCIDENT_PRIORITY.CRITICAL}>Critical</option>
          </Select>
        </div>

        <Textarea
          label="Description"
          placeholder="Detailed explanation, steps to reproduce, or incident timeline..."
          rows={5}
          disabled={isPending || !canEditDetails}
          error={errors.description?.message}
          helperText={!canEditDetails ? "Only the assigned engineer, creator, or managers can edit description" : undefined}
          {...register("description")}
        />

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-color">
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isPending}
            disabled={isPending}
            leftIcon={<Save className="h-4 w-4" />}
          >
            {isPending ? "Saving changes..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default EditIncidentModal;

