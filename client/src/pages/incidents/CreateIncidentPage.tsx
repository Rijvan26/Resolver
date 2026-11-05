import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
} from "@/types";
import { useCreateIncidentMutation } from "@/features/incidents/incidentsApi";
import { useGetMembersQuery } from "@/features/members/membersApi";
import { incidentFormSchema, IncidentFormValues } from "@/features/incidents/schemas";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { parseApiError } from "@/lib/apiErrors";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";

export const CreateIncidentPage: React.FC = () => {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const [createIncidentMutation, { isLoading }] = useCreateIncidentMutation();

  // Load eligible active members for initial assignment
  const { data: membersData } = useGetMembersQuery({ status: "active", limit: 100 });
  const members = membersData?.data?.members || [];

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentFormSchema),
    defaultValues: {
      title: "",
      description: "",
      status: INCIDENT_STATUS.OPEN,
      priority: INCIDENT_PRIORITY.MEDIUM,
      assigneeId: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: IncidentFormValues) => {
    setServerError(null);

    try {
      const payload = {
        title: values.title.trim(),
        description: values.description.trim(),
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId ? values.assigneeId : null,
      };

      const response = await createIncidentMutation(payload).unwrap();

      if (response.success && response.data?.id) {
        navigate(`/incidents/${response.data.id}`);
      } else {
        navigate("/incidents");
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);

      if (parsed.fieldErrors) {
        Object.entries(parsed.fieldErrors).forEach(([field, msg]) => {
          if (
            field === "title" ||
            field === "description" ||
            field === "status" ||
            field === "priority" ||
            field === "assigneeId"
          ) {
            setError(field as keyof IncidentFormValues, { message: msg });
          }
        });
      }
    }
  };

  const isPending = isLoading || isSubmitting;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-12">
      {/* Top Navigation */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/incidents")}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="text-xs"
        >
          Back to Incidents
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm dark:bg-brand-500">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-main-fg">
            Report New Incident
          </h1>
          <p className="mt-1 text-sm text-muted-fg">
            Log an operational outage, service degradation, or security event
          </p>
        </div>
      </div>

      {serverError && (
        <Alert variant="error" title="Submission Error" onDismiss={() => setServerError(null)}>
          {serverError}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Incident Details</CardTitle>
          <CardDescription>
            Provide accurate details to help your engineering team quickly triage and resolve the issue
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <CardContent className="space-y-5">
            {/* Title */}
            <Input
              label="Incident Title"
              placeholder="e.g., API Gateway latency spike in EU-West"
              disabled={isPending}
              error={errors.title?.message}
              {...register("title")}
            />

            {/* Severity & Status */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select
                label="Priority Severity"
                disabled={isPending}
                error={errors.priority?.message}
                {...register("priority")}
              >
                <option value={INCIDENT_PRIORITY.LOW}>Low — Minor inconvenience</option>
                <option value={INCIDENT_PRIORITY.MEDIUM}>Medium — Moderate impact</option>
                <option value={INCIDENT_PRIORITY.HIGH}>High — Significant degradation</option>
                <option value={INCIDENT_PRIORITY.CRITICAL}>Critical — Service outage / blocker</option>
              </Select>

              <Select
                label="Initial Status"
                disabled={isPending}
                error={errors.status?.message}
                {...register("status")}
              >
                <option value={INCIDENT_STATUS.OPEN}>Open (Needs triage)</option>
                <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress (Active investigation)</option>
                <option value={INCIDENT_STATUS.RESOLVED}>Resolved (Mitigated)</option>
                <option value={INCIDENT_STATUS.CLOSED}>Closed</option>
              </Select>
            </div>

            {/* Assignee */}
            <Select
              label="Assign Lead Engineer (Optional)"
              disabled={isPending}
              error={errors.assigneeId?.message}
              helperText="You can also assign or reassign later"
              {...register("assigneeId")}
            >
              <option value="">-- Leave Unassigned for now --</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.email}) — {member.role}
                </option>
              ))}
            </Select>

            {/* Description */}
            <Textarea
              label="Description & Impact"
              placeholder="Describe the symptoms, affected services, error messages, or steps to reproduce..."
              rows={6}
              disabled={isPending}
              error={errors.description?.message}
              {...register("description")}
            />
          </CardContent>

          <CardFooter className="flex items-center justify-between border-t border-border-color pt-4">
            <Link to="/incidents">
              <Button type="button" variant="outline" disabled={isPending}>
                Cancel
              </Button>
            </Link>

            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
              disabled={isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
            >
              {isPending ? "Creating incident..." : "Create Incident"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default CreateIncidentPage;
