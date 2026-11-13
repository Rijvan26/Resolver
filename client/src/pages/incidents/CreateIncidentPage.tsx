import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAppSelector } from "@/app/hooks";
import {
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  ROLES,
  INCIDENT_ASSIGNMENT_PERMISSIONS,
  INCIDENT_PRIORITY_CREATION_PERMISSIONS,
  INCIDENT_STATUS_CREATION_PERMISSIONS,
} from "@/types";
import { useCreateIncidentMutation } from "@/features/incidents/incidentsApi";
import { useGetMembersQuery } from "@/features/members/membersApi";
import { useClarifyReportMutation } from "@/features/incidents/aiApi";
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
  Sparkles,
  HelpCircle,
  X,
} from "lucide-react";

export const CreateIncidentPage: React.FC = () => {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const { user } = useAppSelector((state) => state.auth);

  const [createIncidentMutation, { isLoading }] = useCreateIncidentMutation();

  // Load eligible active members for initial assignment
  const { data: membersData } = useGetMembersQuery({ status: "active", limit: 100 });
  const allMembers = membersData?.data?.members || [];

  // Filter assignable members based on current user's role hierarchy
  const allowedAssigneeRoles = user?.role
    ? INCIDENT_ASSIGNMENT_PERMISSIONS[user.role] || []
    : [];
  const assignableMembers = allMembers.filter((m) =>
    allowedAssigneeRoles.includes(m.role)
  );

  // Allowed priorities and statuses for user's role
  const allowedPriorities = user?.role
    ? INCIDENT_PRIORITY_CREATION_PERMISSIONS[user.role] || []
    : [INCIDENT_PRIORITY.LOW, INCIDENT_PRIORITY.MEDIUM, INCIDENT_PRIORITY.HIGH];

  const allowedStatuses = user?.role
    ? INCIDENT_STATUS_CREATION_PERMISSIONS[user.role] || []
    : [INCIDENT_STATUS.OPEN, INCIDENT_STATUS.IN_PROGRESS];

  const {
    register,
    handleSubmit,
    getValues,
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

  const [clarifyReport, { isLoading: isClarifying }] = useClarifyReportMutation();
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyFeedback, setClarifyFeedback] = useState<string | null>(null);
  const [showClarify, setShowClarify] = useState<boolean>(false);

  const handleCheckClarity = async () => {
    setClarifyFeedback(null);
    const titleVal = getValues("title");
    const descVal = getValues("description");

    try {
      const res = await clarifyReport({
        title: titleVal,
        description: descVal,
      }).unwrap();

      if (res.data?.vague && res.data.questions.length > 0) {
        setClarifyQuestions(res.data.questions);
        setShowClarify(true);
      } else {
        setClarifyQuestions([]);
        setClarifyFeedback(
          res.data?.vague
            ? (res.data.reason || "Report is a bit brief. Adding symptoms or error codes can speed up triage.")
            : "Report looks clear and contains good diagnostic detail!"
        );
        setShowClarify(true);
      }
    } catch {
      // Fail-open: form works completely without AI
      setClarifyFeedback("Clarity assistant unavailable right now. You can proceed with standard submission.");
      setShowClarify(true);
    }
  };

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
                helperText={
                  !allowedPriorities.includes(INCIDENT_PRIORITY.CRITICAL)
                    ? "Critical (P1) declaration requires Incident Manager or Admin role"
                    : undefined
                }
                {...register("priority")}
              >
                {allowedPriorities.includes(INCIDENT_PRIORITY.LOW) && (
                  <option value={INCIDENT_PRIORITY.LOW}>Low — Minor inconvenience</option>
                )}
                {allowedPriorities.includes(INCIDENT_PRIORITY.MEDIUM) && (
                  <option value={INCIDENT_PRIORITY.MEDIUM}>Medium — Moderate impact</option>
                )}
                {allowedPriorities.includes(INCIDENT_PRIORITY.HIGH) && (
                  <option value={INCIDENT_PRIORITY.HIGH}>High — Significant degradation</option>
                )}
                {allowedPriorities.includes(INCIDENT_PRIORITY.CRITICAL) && (
                  <option value={INCIDENT_PRIORITY.CRITICAL}>Critical — Service outage / blocker</option>
                )}
              </Select>

              <Select
                label="Initial Status"
                disabled={isPending}
                error={errors.status?.message}
                {...register("status")}
              >
                {allowedStatuses.includes(INCIDENT_STATUS.OPEN) && (
                  <option value={INCIDENT_STATUS.OPEN}>Open (Needs triage)</option>
                )}
                {allowedStatuses.includes(INCIDENT_STATUS.IN_PROGRESS) && (
                  <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress (Active investigation)</option>
                )}
                {allowedStatuses.includes(INCIDENT_STATUS.RESOLVED) && (
                  <option value={INCIDENT_STATUS.RESOLVED}>Resolved (Mitigated)</option>
                )}
                {allowedStatuses.includes(INCIDENT_STATUS.CLOSED) && (
                  <option value={INCIDENT_STATUS.CLOSED}>Closed</option>
                )}
              </Select>
            </div>

            {/* Assignee */}
            <Select
              label="Assign Lead Engineer (Optional)"
              disabled={isPending}
              error={errors.assigneeId?.message}
              helperText={
                user?.role === ROLES.DEVELOPER
                  ? "As a developer, you may assign to fellow developers or leave unassigned"
                  : "You can also assign or reassign later"
              }
              {...register("assigneeId")}
            >
              <option value="">-- Leave Unassigned for now --</option>
              {assignableMembers.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name} ({member.email}) — {member.role}
                </option>
              ))}
            </Select>

            {/* Description with Inline Clarification Assistant (FR-05) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-main-fg">
                  Description & Impact
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCheckClarity}
                  disabled={isPending || isClarifying}
                  className="h-6 px-2 text-[11px] text-brand-600 hover:text-brand-700 dark:text-brand-400"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {isClarifying ? "Checking clarity..." : "Help me describe this"}
                </Button>
              </div>

              <Textarea
                placeholder="Describe the symptoms, affected services, error messages, or steps to reproduce..."
                rows={6}
                disabled={isPending}
                error={errors.description?.message}
                {...register("description")}
              />

              {/* Inline Report Clarification Suggestions */}
              {showClarify && (
                <div className="rounded-lg border border-indigo-200/90 bg-indigo-50/70 p-3.5 text-xs text-indigo-950 dark:border-indigo-900/80 dark:bg-indigo-950/40 dark:text-indigo-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-xs">
                      <HelpCircle className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <span>Report Clarification Guidance</span>
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">
                        Optional
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowClarify(false)}
                      className="h-6 w-6 p-0 text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900"
                      title="Hide guidance"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {clarifyQuestions.length > 0 ? (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-indigo-900/90 dark:text-indigo-200/90">
                        Answering these points can help responders diagnose and mitigate the incident faster:
                      </p>
                      <ul className="list-disc list-inside space-y-1 text-[11px] font-medium text-indigo-950 dark:text-indigo-100">
                        {clarifyQuestions.map((q, idx) => (
                          <li key={idx} className="leading-relaxed">
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-[11px] text-indigo-900 dark:text-indigo-200">
                      {clarifyFeedback}
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 border-t border-border-color pt-4">
            <Link to="/incidents" className="w-full sm:w-auto">
              <Button type="button" variant="outline" disabled={isPending} className="w-full sm:w-auto min-h-[40px]">
                Cancel
              </Button>
            </Link>

            <Button
              type="submit"
              variant="primary"
              isLoading={isPending}
              disabled={isPending}
              leftIcon={<CheckCircle2 className="h-4 w-4" />}
              className="w-full sm:w-auto min-h-[40px]"
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
