import React, { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import { cn } from "@/lib/utils";
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
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { AiSimilarIncidentsCard } from "@/features/incidents/components/AiSimilarIncidentsCard";
import { AiDuplicateBanner } from "@/features/incidents/components/AiDuplicateBanner";
import { AiSeverityMismatchBanner } from "@/features/incidents/components/AiSeverityMismatchBanner";
import { AiStatusDraftCard } from "@/features/incidents/components/AiStatusDraftCard";
import { GroupedAlertsCard } from "@/features/incidents/components/GroupedAlertsCard";
import { AiSuggestedRunbooksCard } from "@/features/incidents/components/AiSuggestedRunbooksCard";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import { parseApiError } from "@/lib/apiErrors";
import {
  ArrowLeft,
  Edit,
  UserPlus,
  Trash2,
  User,
  MessageSquare,
  History,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  MoreHorizontal,
  Video,
  LayoutGrid,
} from "lucide-react";

type DetailTab = "overview" | "ai" | "messages" | "timeline";
const VALID_DETAIL_TABS: readonly DetailTab[] = ["overview", "ai", "messages", "timeline"];

interface DetailTabConfig {
  id: DetailTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const DETAIL_TABS: readonly DetailTabConfig[] = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "ai", label: "AI", icon: Sparkles },
  { id: "messages", label: "Messages", icon: MessageSquare },
  { id: "timeline", label: "Timeline", icon: History },
];

const SlackIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4 shrink-0" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path fill="#E01E5A" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.528 2.528 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" />
    <path fill="#36C5F0" d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" />
    <path fill="#2EB67D" d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312z" />
    <path fill="#ECB22E" d="M15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.528 2.528 0 0 1 2.52-2.521h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

export const IncidentDetailsPage: React.FC = () => {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [activeTimelineTab, setActiveTimelineTab] = useState<"timeline" | "comments">("timeline");
  const [actionError, setActionError] = useState<string | null>(null);

  const rawTab = searchParams.get("tab") as DetailTab | null;
  const activeTab: DetailTab =
    rawTab && VALID_DETAIL_TABS.includes(rawTab) ? rawTab : "overview";

  const handleTabChange = (nextTab: DetailTab) => {
    const next = new URLSearchParams(searchParams);
    if (nextTab === "overview") {
      next.delete("tab");
    } else {
      next.set("tab", nextTab);
    }
    setSearchParams(next);
  };

  const tabRefs = useRef<Record<DetailTab, HTMLButtonElement | null>>({
    overview: null,
    ai: null,
    messages: null,
    timeline: null,
  });

  useEffect(() => {
    const el = tabRefs.current[activeTab];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeTab]);

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

  const formatRole = (role?: string) => {
    if (!role) return "";
    switch (role) {
      case ROLES.SUPER_ADMIN:
        return "Super Admin";
      case ROLES.ADMIN:
        return "Admin";
      case ROLES.MANAGER:
        return "Manager";
      case ROLES.DEVELOPER:
        return "Developer";
      default:
        return role;
    }
  };

  // Real SLA computation based on priority target and incident.createdAt
  const calculateSlaStatus = (
    createdAt: string,
    priority: IncidentPriority,
    status: IncidentStatus
  ) => {
    if (status === INCIDENT_STATUS.RESOLVED || status === INCIDENT_STATUS.CLOSED) {
      return { text: "Met (Incident Resolved)", isBreached: false };
    }

    const createdTime = new Date(createdAt).getTime();
    if (Number.isNaN(createdTime)) return { text: "Standard SLA", isBreached: false };

    const slaTargetMs: Record<IncidentPriority, number> = {
      [INCIDENT_PRIORITY.CRITICAL]: 1 * 60 * 60 * 1000,
      [INCIDENT_PRIORITY.HIGH]: 4 * 60 * 60 * 1000,
      [INCIDENT_PRIORITY.MEDIUM]: 24 * 60 * 60 * 1000,
      [INCIDENT_PRIORITY.LOW]: 72 * 60 * 60 * 1000,
    };

    const target = slaTargetMs[priority] || 24 * 60 * 60 * 1000;
    const deadline = createdTime + target;
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) {
      const overdueMinutes = Math.floor(Math.abs(remainingMs) / 60000);
      const overdueHours = Math.floor(overdueMinutes / 60);
      const mins = overdueMinutes % 60;
      return {
        text: `Breached (${overdueHours}h ${mins}m overdue)`,
        isBreached: true,
      };
    }

    const remainingMinutes = Math.floor(remainingMs / 60000);
    const remainingHours = Math.floor(remainingMinutes / 60);
    const mins = remainingMinutes % 60;
    return {
      text: `On Track (${remainingHours}h ${mins}m remaining)`,
      isBreached: false,
    };
  };

  const statusDotColor = (st: IncidentStatus) => {
    switch (st) {
      case INCIDENT_STATUS.OPEN:
        return "bg-sky-500";
      case INCIDENT_STATUS.IN_PROGRESS:
        return "bg-brand-500";
      case INCIDENT_STATUS.RESOLVED:
        return "bg-emerald-500";
      case INCIDENT_STATUS.CLOSED:
        return "bg-slate-400";
      default:
        return "bg-slate-400";
    }
  };

  const priorityDotColor = (p: IncidentPriority) => {
    switch (p) {
      case INCIDENT_PRIORITY.CRITICAL:
        return "bg-rose-500";
      case INCIDENT_PRIORITY.HIGH:
        return "bg-amber-500";
      case INCIDENT_PRIORITY.MEDIUM:
        return "bg-yellow-500";
      case INCIDENT_PRIORITY.LOW:
        return "bg-slate-400";
      default:
        return "bg-slate-400";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-12">
        <Skeleton className="h-9 w-44 rounded-xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-80 w-full rounded-2xl" />
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
  const triageSuggestion = aiStatus?.suggestions?.triage;
  const isRuleBased =
    triageSuggestion?.model === "rules-engine" || triageSuggestion?.provider === "rules";
  const confidencePercent = triageSuggestion?.output?.confidence
    ? Math.round(triageSuggestion.output.confidence * 100)
    : null;
  const slaStatus = calculateSlaStatus(incident.createdAt, incident.priority, incident.status);

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto pb-16 px-2.5 sm:px-0">
      {/* Top Tab Bar & Action Toolbar (Pixel-matched with Image 4) */}
      <div className="flex items-center justify-between gap-2 sm:gap-4 border-b border-border-color pb-0 max-w-full">
        {/* The 4 Tab Options: Overview, AI, Messages, Timeline */}
        <div className="relative flex-1 min-w-0 max-w-full overflow-hidden">
          <div
            role="tablist"
            aria-label="Incident detail views"
            className="flex items-center gap-4 sm:gap-6 overflow-x-auto whitespace-nowrap scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-6 sm:pr-0"
          >
            {DETAIL_TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => handleTabChange(tab.id)}
                  className={`flex items-center gap-2 pb-3 px-1 text-xs sm:text-sm transition-colors border-b-2 -mb-px whitespace-nowrap cursor-pointer snap-start min-h-[44px] sm:min-h-0 ${
                    isActive
                      ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400 font-semibold"
                      : "border-transparent text-muted-fg hover:text-main-fg hover:border-slate-300 dark:hover:border-slate-700 font-medium"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive ? "text-brand-600 dark:text-brand-400" : "text-muted-fg"
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
          {/* Subtle fade on right edge on mobile */}
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-page to-transparent sm:hidden" />
        </div>

        {/* Action Buttons: on mobile Edit/Assign are inside '...' menu, no 2-row wrapping */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 pb-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditOpen(true)}
            disabled={!canEditIncident}
            className="hidden sm:inline-flex rounded-xl text-xs h-9 px-3.5 bg-card-bg shadow-xs border-border-color"
            leftIcon={<Edit className="h-3.5 w-3.5" />}
          >
            Edit
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsAssignOpen(true)}
            disabled={!canReassign}
            className="hidden sm:inline-flex rounded-xl text-xs h-9 px-3.5 bg-card-bg shadow-xs border-border-color"
            leftIcon={<UserPlus className="h-3.5 w-3.5" />}
          >
            Assign
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/incidents/new")}
            className="rounded-xl text-xs min-h-[40px] sm:min-h-0 h-10 sm:h-9 px-3 sm:px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm shrink-0 whitespace-nowrap"
          >
            <span className="hidden sm:inline">+ Declare Incident</span>
            <span className="sm:hidden">+ Declare</span>
          </Button>

          {/* ... More actions dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(!isMenuOpen);
                setStatusMenuOpen(false);
                setPriorityMenuOpen(false);
              }}
              className="h-10 w-10 sm:h-9 sm:w-9 flex items-center justify-center rounded-xl border border-border-color bg-card-bg hover:bg-pill text-muted-fg transition-colors shrink-0 min-h-[40px] sm:min-h-0"
              aria-label="More actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {isMenuOpen && (
              <div className="absolute right-0 mt-1.5 z-30 min-w-[170px] rounded-xl border border-border-color bg-card-bg p-1.5 shadow-xl space-y-0.5">
                {/* On mobile: Edit and Assign actions are here */}
                {canEditIncident && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="sm:hidden flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-main-fg hover:bg-pill rounded-lg text-left min-h-[40px]"
                  >
                    <Edit className="h-3.5 w-3.5 text-muted-fg" />
                    Edit Incident
                  </button>
                )}
                {canReassign && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAssignOpen(true);
                      setIsMenuOpen(false);
                    }}
                    className="sm:hidden flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-main-fg hover:bg-pill rounded-lg text-left min-h-[40px]"
                  >
                    <UserPlus className="h-3.5 w-3.5 text-muted-fg" />
                    Assign Incident
                  </button>
                )}

                {user?.role && (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN) && (
                  <div className="pt-1 mt-1 border-t border-border-color">
                    <button
                      type="button"
                      onClick={() => {
                        setIsDeleteOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg text-left min-h-[40px]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete Incident
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {actionError && (
        <Alert variant="error" title="Action Failed" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* When on AI, Messages, or Timeline tabs: show clean back-to-overview top bar (Matching Image 3) */}
      {activeTab !== "overview" && (
        <div
          className={cn(
            "items-center justify-between gap-3",
            activeTab === "ai" ? "hidden sm:flex" : "flex"
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-200/90 bg-brand-50/80 px-3.5 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-800 dark:bg-brand-950/50 dark:text-brand-300">
            <span className="h-2 w-2 rounded-full bg-brand-600" />
            <span>
              {activeTab === "ai"
                ? "Viewing AI Insights & Copilots"
                : activeTab === "messages"
                ? "Viewing Discussion & Messages"
                : "Viewing Audit Timeline"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border-color bg-card-bg px-3.5 py-2 text-xs font-semibold text-brand-600 hover:text-brand-700 hover:bg-pill transition-colors shadow-2xs min-h-[40px] sm:min-h-0"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Overview
          </button>
        </div>
      )}

      {/* Main Overview Tab (Image 2 exact 2-column layout) */}
      {activeTab === "overview" && (
        <div className="space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3 items-start">
            {/* Left Column (2 cols) */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              {/* Card 1: Incident Header Card */}
              <Card className="rounded-2xl border border-border-color bg-card-bg p-4 sm:p-6 shadow-sm">
                <div className="space-y-3">
                  {/* Top Badges Row: #id, Status Dropdown Pill, Priority Dropdown Pill */}
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-border-color">
                      #{incident.id.slice(-8)}
                    </span>

                    {/* Status Pill Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setStatusMenuOpen(!statusMenuOpen);
                          setPriorityMenuOpen(false);
                          setIsMenuOpen(false);
                        }}
                        disabled={isUpdating || !canChangeStatus}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-color bg-pill px-3 py-1 text-xs font-semibold text-main-fg hover:bg-pill-hover transition-colors shadow-2xs"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${statusDotColor(incident.status)}`} />
                        <span>Status</span>
                        <ChevronDown className="h-3 w-3 text-muted-fg" />
                      </button>

                      {statusMenuOpen && (
                        <div className="absolute left-0 mt-1 z-30 min-w-[140px] rounded-xl border border-border-color bg-card-bg p-1 shadow-lg">
                          {[
                            { value: INCIDENT_STATUS.OPEN, label: "Open", color: "bg-sky-500" },
                            { value: INCIDENT_STATUS.IN_PROGRESS, label: "In Progress", color: "bg-brand-500" },
                            { value: INCIDENT_STATUS.RESOLVED, label: "Resolved", color: "bg-emerald-500" },
                            ...(canCloseIncident
                              ? [{ value: INCIDENT_STATUS.CLOSED, label: "Closed", color: "bg-slate-400" }]
                              : []),
                          ].map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => {
                                handleQuickStatusChange(item.value);
                                setStatusMenuOpen(false);
                              }}
                              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                                incident.status === item.value
                                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold"
                                  : "text-main-fg hover:bg-pill"
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${item.color}`} />
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Priority Pill Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setPriorityMenuOpen(!priorityMenuOpen);
                          setStatusMenuOpen(false);
                          setIsMenuOpen(false);
                        }}
                        disabled={isUpdating || !canChangePriority}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-color bg-pill px-3 py-1 text-xs font-semibold text-main-fg hover:bg-pill-hover transition-colors shadow-2xs"
                      >
                        <span className={`h-2 w-2 rounded-full shrink-0 ${priorityDotColor(incident.priority)}`} />
                        <span>Priority</span>
                        <ChevronDown className="h-3 w-3 text-muted-fg" />
                      </button>

                      {priorityMenuOpen && (
                        <div className="absolute left-0 mt-1 z-30 min-w-[140px] rounded-xl border border-border-color bg-card-bg p-1 shadow-lg">
                          {[
                            { value: INCIDENT_PRIORITY.CRITICAL, label: "Critical", color: "bg-rose-500" },
                            { value: INCIDENT_PRIORITY.HIGH, label: "High", color: "bg-amber-500" },
                            { value: INCIDENT_PRIORITY.MEDIUM, label: "Medium", color: "bg-yellow-500" },
                            { value: INCIDENT_PRIORITY.LOW, label: "Low", color: "bg-slate-400" },
                          ].map((item) => (
                            <button
                              key={item.value}
                              type="button"
                              onClick={() => {
                                handleQuickPriorityChange(item.value);
                                setPriorityMenuOpen(false);
                              }}
                              className={`flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-xs font-medium text-left transition-colors ${
                                incident.priority === item.value
                                  ? "bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 font-semibold"
                                  : "text-main-fg hover:bg-pill"
                              }`}
                            >
                              <span className={`h-2 w-2 rounded-full ${item.color}`} />
                              {item.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Incident Title */}
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main-fg pt-1 [overflow-wrap:anywhere]">
                    {incident.title}
                  </h1>

                  {/* Subtitle: Reported by X • Created Ym ago • Active investigation */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-fg">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <User className="h-3.5 w-3.5 text-muted-fg shrink-0" />
                      <span className="truncate">
                        Reported by{" "}
                        <strong className="text-main-fg font-medium">
                          {creator?.name || "System"}
                        </strong>
                      </span>
                    </div>
                    <span>•</span>
                    <span>Created {formatRelativeTime(incident.createdAt)}</span>
                    <span>•</span>
                    <span>
                      {incident.status === INCIDENT_STATUS.OPEN
                        ? "Active investigation"
                        : incident.status === INCIDENT_STATUS.IN_PROGRESS
                        ? "Under active remediation"
                        : incident.status === INCIDENT_STATUS.RESOLVED
                        ? "Resolved"
                        : "Closed"}
                    </span>
                  </div>
                </div>
              </Card>

              {/* Card 2: Description & Impact Card (With AI Triage strip matching Image 2) */}
              <Card className="rounded-2xl border border-border-color bg-card-bg p-4 sm:p-6 shadow-sm space-y-4 max-w-full overflow-hidden">
                <h2 className="text-[15px] sm:text-base font-bold text-main-fg">
                  Description & Impact
                </h2>

                <div className="text-sm leading-relaxed text-main-fg whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {incident.description}
                </div>

                {/* AI Triage Strip (Pixel-matched with Image 2) */}
                <div className="rounded-xl border border-border-color bg-slate-50/50 dark:bg-slate-900/30 p-3.5 sm:p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400 shrink-0" />
                      <span className="font-semibold text-xs text-main-fg">AI Triage</span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 whitespace-nowrap">
                        {aiStatus?.ai?.status === "pending"
                          ? "Generating"
                          : isRuleBased
                          ? "Rule Match"
                          : "AI-generated"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTabChange("ai")}
                      className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 hover:underline min-h-[36px] sm:min-h-0 inline-flex items-center"
                    >
                      View AI Insights
                    </button>
                  </div>

                  <p className="text-xs text-main-fg font-medium [overflow-wrap:anywhere]">
                    Suggested Action:{" "}
                    <span className="text-muted-fg font-normal">
                      {triageSuggestion?.output?.reason ||
                        aiStatus?.ai?.reason ||
                        (triageSuggestion?.output?.suggestedSeverity
                          ? `Set severity to ${triageSuggestion.output.suggestedSeverity}${
                              confidencePercent ? ` (${confidencePercent}% confidence)` : ""
                            }`
                          : "Run automated triage in AI insights tab for root-cause and severity recommendation.")}
                    </span>
                  </p>
                </div>
              </Card>

              {/* Card 3: Active Timeline Card (Pixel-matched with Image 2) */}
              <Card className="rounded-2xl border border-border-color bg-card-bg p-4 sm:p-6 shadow-sm space-y-4 max-w-full overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-border-color pb-3 flex-wrap">
                  <h2 className="text-[15px] sm:text-base font-bold text-main-fg">
                    Active Timeline
                  </h2>
                  <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveTimelineTab("timeline")}
                      className={`px-3 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg transition-colors ${
                        activeTimelineTab === "timeline"
                          ? "bg-pill text-main-fg shadow-2xs font-semibold"
                          : "text-muted-fg hover:text-main-fg"
                      }`}
                    >
                      Audit Events
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTimelineTab("comments")}
                      className={`px-3 py-1.5 min-h-[36px] sm:min-h-0 rounded-lg transition-colors ${
                        activeTimelineTab === "comments"
                          ? "bg-pill text-main-fg shadow-2xs font-semibold"
                          : "text-muted-fg hover:text-main-fg"
                      }`}
                    >
                      Discussion
                    </button>
                  </div>
                </div>

                {activeTimelineTab === "timeline" ? (
                  <IncidentTimeline incidentId={incident.id} />
                ) : (
                  <CommentList incidentId={incident.id} incident={incident} showSidebar={false} />
                )}
              </Card>
            </div>

            {/* Right Column: Incident Metadata Card (Pixel-matched with Image 2) */}
            <div className="space-y-4 sm:space-y-6">
              <Card className="rounded-2xl border border-border-color bg-card-bg p-4 sm:p-6 shadow-sm space-y-5 sm:space-y-6 text-xs max-w-full overflow-hidden">
                <h2 className="text-base font-bold text-main-fg">
                  Incident Metadata
                </h2>

                {/* Assigned Engineer Section */}
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-main-fg block">
                    Assigned Engineer
                  </span>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        {assignee?.name
                          ? assignee.name.slice(0, 2).toUpperCase()
                          : "NA"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-main-fg truncate">
                          {assignee?.name || "No Engineer Assigned"}
                        </div>
                        <div className="text-[11px] text-muted-fg truncate">
                          {assignee ? assignee.email : "No Engineer Assigned"}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAssignOpen(true)}
                      disabled={!canReassign}
                      className="rounded-xl text-xs h-7 px-3 text-brand-600 border-brand-200 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300 dark:hover:bg-brand-950/60 shrink-0"
                    >
                      + Assign
                    </Button>
                  </div>
                </div>

                {/* Context Section */}
                <div className="pt-4 border-t border-border-color space-y-2">
                  <span className="text-xs font-semibold text-main-fg block mb-2">
                    Context
                  </span>
                  <div className="space-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-fg">Service: </span>
                      <span className="font-medium text-main-fg">
                        {incident.service?.name || "None"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-fg">Environment: </span>
                      <span className="font-medium text-main-fg">
                        {incident.service?.tier
                          ? `Tier ${incident.service.tier} Production`
                          : "Production"}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-fg">SLA Status: </span>
                      <span
                        className={`font-medium ${
                          slaStatus.isBreached
                            ? "text-rose-600 dark:text-rose-400 font-semibold"
                            : "text-main-fg"
                        }`}
                      >
                        {slaStatus.text}
                      </span>
                    </div>
                  </div>
                </div>

                {/* War Room Section */}
                <div className="pt-4 border-t border-border-color space-y-2.5">
                  <span className="text-xs font-semibold text-main-fg block">
                    War Room
                  </span>
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <SlackIcon className="h-4 w-4" />
                      <div className="min-w-0 flex items-center gap-1.5 truncate">
                        <span className="font-medium text-main-fg">Join Slack Channel</span>
                        <span className="text-muted-fg text-[11px]">
                          #incident-{incident.id.slice(-5)}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4 text-muted-fg shrink-0" />
                      <span className="text-muted-fg truncate">
                        Zoom/Meet: https://meet.resolver.internal/incident-{incident.id.slice(-5)}
                      </span>
                    </div>

                    {incident.service?.runbookLinks && incident.service.runbookLinks.length > 0 && (
                      <div className="pt-1">
                        <a
                          href={incident.service.runbookLinks[0]}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400 inline-flex items-center gap-1"
                        >
                          Service Runbook &rarr;
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Reporter Section */}
                <div className="pt-4 border-t border-border-color space-y-2">
                  <span className="text-xs font-semibold text-main-fg block">
                    Reporter
                  </span>
                  <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-border-color">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">
                      {creator?.name ? creator.name.slice(0, 2).toUpperCase() : "SY"}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-main-fg truncate text-xs">
                        {creator?.name || "System"}{" "}
                        {creator?.role ? (
                          <span className="text-[11px] font-normal text-muted-fg">
                            ({formatRole(creator.role)})
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-muted-fg truncate">
                        {creator?.email || "system@resolver.internal"}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* AI Tab (Full copilot cards preserved with AI-generated labels) */}
      {activeTab === "ai" && (
        <div className="space-y-6">
          <AiDuplicateBanner
            incidentId={incident.id}
            duplicateSuggestion={aiStatus?.suggestions?.duplicate}
            duplicateOf={aiStatus?.duplicateOf}
            linkedIncidentIds={aiStatus?.linkedIncidentIds}
          />

          <AiSeverityMismatchBanner
            reportedSeverity={incident.priority}
            rulesSeverity={
              aiStatus?.ai?.severity || aiStatus?.suggestions?.triage?.output?.suggestedSeverity
            }
          />

          <AiSummaryCard incidentId={incident.id} aiStatus={aiStatus} />

          <AiTriageCard
            incidentId={incident.id}
            aiStatus={aiStatus}
            canModifySeverity={canChangePriority}
            currentPriority={incident.priority}
          />

          <AiSimilarIncidentsCard incidentId={incident.id} />

          <AiStatusDraftCard
            incidentId={incident.id}
            statusDraftSuggestion={aiStatus?.suggestions?.statusDraft}
          />

          <GroupedAlertsCard incidentId={incident.id} />

          <AiSuggestedRunbooksCard incidentId={incident.id} />

          <AiPostmortemCard
            incidentId={incident.id}
            incidentStatus={incident.status}
            aiStatus={aiStatus}
          />
        </div>
      )}

      {/* Messages Tab (Image 3 exact 2-column layout with sidebar) */}
      {activeTab === "messages" && (
        <CommentList incidentId={incident.id} incident={incident} showSidebar={true} />
      )}

      {/* Timeline Tab */}
      {activeTab === "timeline" && (
        <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm">
          <CardContent className="pt-6">
            <IncidentTimeline incidentId={incident.id} />
          </CardContent>
        </Card>
      )}

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
