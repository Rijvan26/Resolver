import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
} from "@/types";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { PriorityBadge } from "@/components/shared/PriorityBadge";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { RoleGate } from "@/components/shared/RoleGate";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { EditIncidentModal } from "@/features/incidents/components/EditIncidentModal";
import { AssignIncidentModal } from "@/features/incidents/components/AssignIncidentModal";
import { DeleteIncidentModal } from "@/features/incidents/components/DeleteIncidentModal";
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
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, isLoading, isError } = useGetIncidentQuery(incidentId || "", {
    skip: !incidentId,
  });

  const [updateIncident, { isLoading: isUpdating }] = useUpdateIncidentMutation();

  const incident = data?.data;

  // Quick Status change handler
  const handleQuickStatusChange = async (newStatus: IncidentStatus) => {
    if (!incident || incident.status === newStatus) return;
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
    if (!incident || incident.priority === newPriority) return;
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
            leftIcon={<Edit className="h-3.5 w-3.5" />}
          >
            Edit Incident
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAssignOpen(true)}
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
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                #{incident.id.slice(-8)}
              </span>
              <StatusBadge status={incident.status} size="md" />
              <PriorityBadge priority={incident.priority} size="md" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {incident.title}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
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
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Quick Status
              </label>
              <Select
                value={incident.status}
                onChange={(e) => handleQuickStatusChange(e.target.value as IncidentStatus)}
                disabled={isUpdating}
                className="text-xs h-8 py-1"
              >
                <option value={INCIDENT_STATUS.OPEN}>Open</option>
                <option value={INCIDENT_STATUS.IN_PROGRESS}>In Progress</option>
                <option value={INCIDENT_STATUS.RESOLVED}>Resolved</option>
                <option value={INCIDENT_STATUS.CLOSED}>Closed</option>
              </Select>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Quick Priority
              </label>
              <Select
                value={incident.priority}
                onChange={(e) => handleQuickPriorityChange(e.target.value as IncidentPriority)}
                disabled={isUpdating}
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
        {/* Left Column: Full Description & Placeholders */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description Section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Description & Impact</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                {incident.description}
              </div>
            </CardContent>
          </Card>

          {/* Phase 5 Integration Placeholder: Comments Section */}
          <Card className="border-dashed border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <MessageSquare className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <CardTitle className="text-sm">Comments & Team Collaboration</CardTitle>
              </div>
              <CardDescription>
                Discussion thread, status updates, and post-incident resolution notes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl bg-slate-50 p-6 text-center dark:bg-slate-900/50">
                <MessageSquare className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Incident Discussion Thread
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Full threaded comments, markdown support, and internal notes will be available in Phase 5.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Phase 5 Integration Placeholder: Activity Timeline */}
          <Card className="border-dashed border-slate-200 dark:border-slate-800">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <History className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <CardTitle className="text-sm">Audit Trail & Activity Timeline</CardTitle>
              </div>
              <CardDescription>
                Lifecycle transitions, assignments, and chronological event history
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl bg-slate-50 p-6 text-center dark:bg-slate-900/50">
                <History className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Incident Audit Timeline
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  Comprehensive audit logs and timeline playback will be available in Phase 5.
                </p>
              </div>
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
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Assigned Engineer
                </span>
                {assignee ? (
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        {assignee.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
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
                    <span className="text-slate-400 italic">No engineer assigned</span>
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
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                  Reported By
                </span>
                <div className="flex items-center gap-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {creator?.name || "System"}
                  </div>
                  {creator?.role && <RoleBadge role={creator.role} size="sm" />}
                </div>
                {creator?.email && (
                  <div className="text-[11px] text-slate-500 mt-0.5">{creator.email}</div>
                )}
              </div>

              {/* Timestamps */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                    Created
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">
                    {new Date(incident.createdAt).toLocaleString()}
                  </span>
                </div>

                {incident.updatedAt && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                      Last Updated
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">
                      {new Date(incident.updatedAt).toLocaleString()}
                    </span>
                  </div>
                )}

                {incident.resolvedAt && (
                  <div>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 block">
                      Resolved Date
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
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
