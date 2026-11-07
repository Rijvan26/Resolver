import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import {
  useGetIncidentQuery,
  useUpdateIncidentMutation,
} from "@/features/incidents/incidentsApi";
import {
  INCIDENT_STATUS,
  INCIDENT_PRIORITY,
  IncidentStatus,
  IncidentPriority,
  ROLES,
  INCIDENT_PRIORITY_UPDATE_ROLES,
  INCIDENT_CLOSE_ROLES,
} from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { RoleGate } from "@/components/shared/RoleGate";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { EditIncidentModal } from "@/features/incidents/components/EditIncidentModal";
import { AssignIncidentModal } from "@/features/incidents/components/AssignIncidentModal";
import { DeleteIncidentModal } from "@/features/incidents/components/DeleteIncidentModal";
import { CommentList } from "@/features/incidents/components/CommentList";
import { IncidentTimeline } from "@/features/incidents/components/IncidentTimeline";
import { useGetIncidentAiStatusQuery } from "@/features/incidents/aiApi";
import { AiTriageCard } from "@/features/incidents/components/AiTriageCard";
import { AiSummaryCard } from "@/features/incidents/components/AiSummaryCard";
import { AiPostmortemCard } from "@/features/incidents/components/AiPostmortemCard";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import {
  ArrowLeft,
  Edit,
  UserCheck,
  Trash2,
  Calendar,
  Clock,
  User,
  MessageSquare,
  History,
  AlertTriangle,
} from "lucide-react";

export const IncidentDetailsPage: React.FC = () => {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"comments" | "timeline">("comments");
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useGetIncidentQuery(incidentId || "", {
    skip: !incidentId,
  });

  const { data: aiData } = useGetIncidentAiStatusQuery(incidentId || "", {
    skip: !incidentId,
  });
  const aiStatus = aiData?.data;

  const [updateIncident, { isLoading: isUpdating }] = useUpdateIncidentMutation();
  const { user } = useAppSelector((state) => state.auth);

  const incident = data?.data;

  // RBAC permissions checks
  const canChangePriority = Boolean(user && INCIDENT_PRIORITY_UPDATE_ROLES.includes(user.role));
  const canCloseIncident = Boolean(user && INCIDENT_CLOSE_ROLES.includes(user.role));

  const isAssignee = incident?.assignee?.id === user?.id || incident?.assigneeId === user?.id;
  const creatorId = typeof incident?.createdBy === "object" ? incident?.createdBy.id : incident?.createdBy;
  const isCreator = creatorId === user?.id;

  const canChangeStatus = user?.role !== ROLES.DEVELOPER || isAssignee || isCreator;
  const canEditIncident = user?.role !== ROLES.DEVELOPER || isAssignee || isCreator;

  // Reassignment restrictions for developers
  const isAssignedToHigherRole =
    user?.role === ROLES.DEVELOPER &&
    incident?.assignee &&
    incident.assignee.role !== ROLES.DEVELOPER;

  const isAssignedToOtherDev =
    user?.role === ROLES.DEVELOPER &&
    incident?.assignee &&
    incident.assignee.id !== user?.id &&
    !isCreator;

  const canReassign = !isAssignedToHigherRole && !isAssignedToOtherDev;

  // Quick Status change handler
  const handleQuickStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident || incident.status === newStatus || !canChangeStatus) return;
    setActionError(null);

    try {
      await updateIncident({
        id: incident.id,
        data: { status: newStatus },
      }).unwrap();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
    }
  };

  // Quick Priority change handler
  const handleQuickPriorityChange = async (newPriority: IncidentPriority) => {
    if (!incident || incident.priority === newPriority || !canChangePriority) return;
    setActionError(null);

    try {
      await updateIncident({
        id: incident.id,
        data: { priority: newPriority },
      }).unwrap();
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setActionError(parsed.message);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto pb-12">
        <Skeleton className="h-8 w-36" />
        <div className="space-y-4">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !incident) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <EmptyState
          title="Incident Not Found"
          description="The requested incident could not be found, or you do not have permission to view it."
          icon={<AlertTriangle className="h-10 w-10 text-rose-500" />}
          action={
            <Button
              variant="primary"
              size="sm"
              onClick={() => navigate("/incidents")}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
            >
              Back to Incidents List
            </Button>
          }
        />
      </div>
    );
  }

  const creator = typeof incident.createdBy === "object" ? incident.createdBy : null;
  const assignee = incident.assignee;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Top Breadcrumb & Action Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/incidents")}
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          className="text-xs w-fit"
        >
          Back to Incidents
        </Button>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            disabled={!canEditIncident}
            title={!canEditIncident ? "Only the assigned engineer, creator, or managers can edit details" : undefined}
            leftIcon={<Edit className="h-3.5 w-3.5" />}
          >
            Edit Incident
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAssignOpen(true)}
            disabled={!canReassign}
            title={
              isAssignedToHigherRole
                ? "Cannot reassign incident assigned to admin or manager"
                : isAssignedToOtherDev
                ? "Only the assigned engineer, creator, or managers can reassign"
                : undefined
            }
            leftIcon={<UserCheck className="h-3.5 w-3.5" />}
          >
            {assignee ? "Reassign" : "Assign"}
          </Button>

          {/* Delete action only accessible to SUPER_ADMIN and ADMIN */}
          <RoleGate allowedRoles={[ROLES.SUPER_ADMIN, ROLES.ADMIN]}>
            <Button
              variant="danger"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
            >
              Delete
            </Button>
          </RoleGate>
        </div>
      </div>

      {actionError && (
        <Alert variant="error" title="Action Failed" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Incident Header Card */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-pill text-slate-600 dark:text-slate-300">
                #{incident.id.slice(-8)}
              </span>
              <StatusBadge status={incident.status} size="md" />
              <PriorityBadge priority={incident.priority} size="md" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-main-fg">
              {incident.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-fg">
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                <span>
                  Reported by <strong>{creator?.name || "System"}</strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>Created {formatRelativeTime(incident.createdAt)}</span>
              </div>
              {incident.updatedAt && (
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Updated {formatRelativeTime(incident.updatedAt)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Lifecycle Controls */}
          <div className="flex flex-col sm:flex-row md:flex-col gap-2 shrink-0">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-fg block mb-1">
                Quick Status
              </label>
              <Select
                value={incident.status}
                onChange={(e) => handleQuickStatusChange(e.target.value as IncidentStatus)}
                disabled={isUpdating || !canChangeStatus}
                title={!canChangeStatus ? "Only assigned engineer or managers can change status" : undefined}
                className="text-xs h-8 py-1"
              >
                <option value={INCIDENT_STATUS.OPEN}>Open</option>
                <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress</option>
                <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
                {canCloseIncident && <option value={INCIDENT_STATUS.CLOSED}>Closed</option>}
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-fg block mb-1">
                Quick Priority
              </label>
              <Select
                value={incident.priority}
                onChange={(e) => handleQuickPriorityChange(e.target.value as IncidentPriority)}
                disabled={isUpdating || !canChangePriority}
                title={!canChangePriority ? "Severity changes require Incident Manager or Admin role" : undefined}
                className="text-xs h-8 py-1"
              >
                <option value={INCIDENT_PRIORITY.LOW}>Low</option>
                <option value={INCIDENT_PRIORITY.MEDIUM}>Medium</option>
                <option value={INCIDENT_PRIORITY.HIGH}>High</option>
                <option value={INCIDENT_PRIORITY.CRITICAL}>Critical</option>
              </Select>
            </div>
          </div>
        </div>
      </Card>

      {/* Main Grid: Description & Metadata */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left Column: AI Assistant, Full Description & Discussion */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Status Overview */}
          <AiSummaryCard incidentId={incident.id} aiStatus={aiStatus} />

          {/* AI Triage & Severity Recommendation */}
          <AiTriageCard
            incidentId={incident.id}
            aiStatus={aiStatus}
            canModifySeverity={canChangePriority}
            currentPriority={incident.priority}
          />

          {/* Description Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description & Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap text-main-fg">
                {incident.description}
              </div>
            </CardContent>
          </Card>

          {/* AI Postmortem Draft (Only for resolved/closed incidents) */}
          <AiPostmortemCard
            incidentId={incident.id}
            incidentStatus={incident.status}
            aiStatus={aiStatus}
          />

          {/* Tabbed Comments & Audit Timeline */}
          <Card>
            <div className="border-b border-slate-200 px-6 pt-3 dark:border-slate-800">
              <div className="flex gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("comments")}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-semibold transition-colors ${
                    activeTab === "comments"
                      ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-muted-fg dark:hover:text-slate-200"
                  }`}
                >
                  <MessageSquare className="h-4 w-4" />
                  Discussion & Comments
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-semibold transition-colors ${
                    activeTab === "timeline"
                      ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                      : "border-transparent text-slate-500 hover:text-slate-800 dark:text-muted-fg dark:hover:text-slate-200"
                  }`}
                >
                  <History className="h-4 w-4" />
                  Audit Timeline
                </button>
              </div>
            </div>
            <CardContent className="pt-5">
              {activeTab === "comments" ? (
                <CommentList incidentId={incident.id} />
              ) : (
                <IncidentTimeline incidentId={incident.id} />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Metadata & Assignment Details */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Incident Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {/* Assignee */}
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1.5">
                  Assigned Engineer
                </span>
                {assignee ? (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        {assignee.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-main-fg truncate">
                          {assignee.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{assignee.email}</div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsAssignOpen(true)}
                      className="text-xs h-7 px-2 shrink-0"
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 p-2.5 dark:border-slate-700">
                    <span className="text-muted-fg italic">No engineer assigned</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAssignOpen(true)}
                      className="text-xs h-7 px-2"
                    >
                      Assign
                    </Button>
                  </div>
                )}
              </div>

              {/* Reporter */}
              <div className="pt-2 border-t border-border-color">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                  Reported By
                </span>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-main-fg">
                    {creator?.name || "System"}
                  </div>
                  {creator?.role && <RoleBadge role={creator.role} size="sm" />}
                </div>
                {creator?.email && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{creator.email}</div>
                )}
              </div>

              {/* Affected Service */}
              {incident.service && (
                <div className="pt-2 border-t border-border-color">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                    Affected Service
                  </span>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-main-fg">
                      {incident.service.name}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Tier {incident.service.tier}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-fg mt-0.5">
                    Owning Team: {incident.service.owningTeam}
                  </div>
                  {incident.service.runbookLinks && incident.service.runbookLinks.length > 0 && (
                    <div className="mt-1">
                      <a
                        href={incident.service.runbookLinks[0]}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-brand-600 hover:underline dark:text-brand-400 font-medium inline-flex items-center gap-1"
                      >
                        Service Runbook &rarr;
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Timestamps */}
              <div className="pt-2 border-t border-border-color space-y-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block">
                    Created
                  </span>
                  <span className="text-main-fg">
                    {new Date(incident.createdAt).toLocaleString()}
                  </span>
                </div>

                {incident.updatedAt && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block">
                      Last Updated
                    </span>
                    <span className="text-main-fg">
                      {new Date(incident.updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}

                {incident.resolvedAt && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block">
                      Resolved Date
                    </span>
                    <span className="text-healthy-text font-medium">
                      {new Date(incident.resolvedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <EditIncidentModal
        incident={incident}
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
      />

      <AssignIncidentModal
        incident={incident}
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
      />

      <DeleteIncidentModal
        incidentId={incident.id}
        incidentTitle={incident.title}
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onSuccess={() => navigate("/incidents")}
      />
    </div>
  );
};

export default IncidentDetailsPage;
