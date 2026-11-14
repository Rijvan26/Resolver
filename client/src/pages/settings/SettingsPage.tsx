import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import {
  useGetOrganizationQuery,
  useUpdateOrganizationMutation,
} from "@/features/organization/organizationApi";
import {
  updateOrganizationFormSchema,
  UpdateOrganizationFormValues,
} from "@/features/organization/schemas";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLES } from "@/types";
import { parseApiError } from "@/lib/apiErrors";
import { DeleteOrganizationModal } from "@/features/organization/components/DeleteOrganizationModal";
import { PasswordManagementCard } from "@/features/auth/components/PasswordManagementCard";
import {
  Building,
  Users,
  ShieldCheck,
  Link as LinkIcon,
  CreditCard,
  Globe,
  Lock,
  Sparkles,
  Layers,
  BookOpen,
  Bot,
  CheckCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";

type SettingsTab =
  | "general"
  | "members"
  | "security"
  | "integrations"
  | "billing"
  | "ai";

export const SettingsPage: React.FC = () => {
  const { user, organization: authOrg } = useAppSelector((state) => state.auth);
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const isPrivileged =
    user?.role === ROLES.SUPER_ADMIN || user?.role === ROLES.ADMIN;

  const {
    data: orgData,
    isLoading,
    isError,
    refetch,
  } = useGetOrganizationQuery();

  const [updateOrganization, { isLoading: isUpdating }] =
    useUpdateOrganizationMutation();

  const organization = orgData?.data || authOrg;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty },
  } = useForm<UpdateOrganizationFormValues>({
    resolver: zodResolver(updateOrganizationFormSchema),
    defaultValues: {
      name: organization?.name || "",
      statusPageEnabled: organization?.statusPageEnabled || false,
      aiSettings: {
        alertGrouping: organization?.aiSettings?.alertGrouping ?? true,
        runbooks: organization?.aiSettings?.runbooks ?? true,
        assistant: organization?.aiSettings?.assistant ?? true,
        alertGroupingWindowMinutes:
          organization?.aiSettings?.alertGroupingWindowMinutes ?? 30,
        alertGroupingSimilarityThreshold:
          organization?.aiSettings?.alertGroupingSimilarityThreshold ?? 0.82,
      },
    },
  });

  const statusPageEnabled = watch("statusPageEnabled");

  // Keep form in sync when organization query loads
  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        statusPageEnabled: organization.statusPageEnabled ?? false,
        aiSettings: {
          alertGrouping: organization.aiSettings?.alertGrouping ?? true,
          runbooks: organization.aiSettings?.runbooks ?? true,
          assistant: organization.aiSettings?.assistant ?? true,
          alertGroupingWindowMinutes:
            organization.aiSettings?.alertGroupingWindowMinutes ?? 30,
          alertGroupingSimilarityThreshold:
            organization.aiSettings?.alertGroupingSimilarityThreshold ?? 0.82,
        },
      });
    }
  }, [organization, reset]);

  const onSubmit = async (values: UpdateOrganizationFormValues) => {
    setServerError(null);
    setSuccessMessage(null);

    try {
      await updateOrganization({
        name: values.name,
        statusPageEnabled: values.statusPageEnabled,
        aiSettings: values.aiSettings,
      }).unwrap();

      setSuccessMessage("Organization settings have been updated successfully.");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  const handleCancel = () => {
    if (organization) {
      reset({
        name: organization.name,
        statusPageEnabled: organization.statusPageEnabled ?? false,
        aiSettings: {
          alertGrouping: organization.aiSettings?.alertGrouping ?? true,
          runbooks: organization.aiSettings?.runbooks ?? true,
          assistant: organization.aiSettings?.assistant ?? true,
          alertGroupingWindowMinutes:
            organization.aiSettings?.alertGroupingWindowMinutes ?? 30,
          alertGroupingSimilarityThreshold:
            organization.aiSettings?.alertGroupingSimilarityThreshold ?? 0.82,
        },
      });
    }
  };

  const formatOrgCreatedDate = (dateStr?: string) => {
    if (!dateStr) return "—";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const navItems = [
    { id: "general" as const, label: "General Profile", icon: Building },
    { id: "members" as const, label: "Members & Teams", icon: Users },
    { id: "security" as const, label: "Security & SSO", icon: ShieldCheck },
    { id: "integrations" as const, label: "Integrations", icon: LinkIcon },
    { id: "billing" as const, label: "Billing & Usage", icon: CreditCard },
    { id: "ai" as const, label: "AI & Automation", icon: Sparkles },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-main-fg">
          Organization Settings
        </h1>
        <p className="text-xs text-muted-fg mt-1">
          Manage your organization details, public status page, and security profile.
        </p>
      </div>

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      {serverError && (
        <Alert variant="error" onDismiss={() => setServerError(null)}>
          {serverError}
        </Alert>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      ) : isError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-6 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <p>Failed to load organization settings.</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="mt-2 text-xs"
          >
            Retry
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
            {/* Left Navigation Menu */}
            <aside className="lg:col-span-1 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2.5 w-auto lg:w-full px-3.5 py-2.5 rounded-xl text-xs transition-all whitespace-nowrap shrink-0 min-h-[40px] text-left ${
                      isActive
                        ? "bg-card-bg shadow-xs border border-border-color text-main-fg font-semibold"
                        : "text-muted-fg hover:text-main-fg hover:bg-pill font-medium border border-transparent"
                    }`}
                  >
                    {isActive ? (
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        <Icon className="h-4 w-4" />
                      </span>
                    ) : (
                      <Icon className="h-4 w-4 shrink-0 text-muted-fg" />
                    )}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </aside>

            {/* Right Main Card */}
            <div className="lg:col-span-3 min-w-0 max-w-full">
              {/* Tab 1: General Profile (Pixel-matched with Image 1) */}
              {activeTab === "general" && (
                <>
                <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm overflow-hidden max-w-full">
                  {/* Card Header */}
                  <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border-color">
                    <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                          <Building className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                            General Profile
                          </CardTitle>
                          <p className="text-xs text-muted-fg truncate">
                            Primary organizational identity and slug
                          </p>
                        </div>
                      </div>

                      {!isPrivileged && (
                        <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-muted-fg shrink-0">
                          <Lock className="h-3 w-3" /> Read Only
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  {/* Card Content Form */}
                  <CardContent className="p-4 sm:p-6 space-y-5 sm:space-y-6">
                    {/* Organization Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-main-fg block">
                        Organization Name
                      </label>
                      <Input
                        {...register("name")}
                        error={errors.name?.message}
                        disabled={!isPrivileged || isUpdating}
                        placeholder="Acme Corporation"
                        className="rounded-xl h-10 text-xs"
                      />
                      <p className="text-[11px] text-muted-fg">
                        The display name of your organization visible to team members.
                      </p>
                    </div>

                    {/* Organization Slug */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-main-fg">
                          Organization Slug
                        </label>
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                          <Lock className="h-2.5 w-2.5" />
                          Locked
                        </span>
                      </div>
                      <Input
                        value={organization?.slug || ""}
                        disabled
                        readOnly
                        className="bg-slate-100/70 dark:bg-slate-900/60 font-mono text-xs text-muted-fg rounded-xl h-10 cursor-not-allowed border border-border-color"
                      />
                      <p className="text-[11px] text-muted-fg">
                        Unique immutable URL identifier assigned during workspace creation.
                      </p>
                    </div>

                    {/* Public Status Page Feature Card */}
                    <div className="rounded-2xl border border-border-color p-4 bg-slate-50/40 dark:bg-slate-900/30">
                      <div className="flex items-start sm:items-center justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400 shrink-0 mt-0.5 sm:mt-0">
                            <Globe className="h-4 w-4" />
                          </div>
                          <div>
                            <h4 className="text-xs font-semibold text-main-fg">
                              Public Status Page
                            </h4>
                            <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                              Allow stakeholders to view system incident status and live service health without signing in.
                            </p>
                          </div>
                        </div>

                        {/* Toggle with Off/On and Inactive/Active */}
                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-xs font-semibold text-main-fg">
                            {statusPageEnabled ? "On" : "Off"}
                          </span>
                          <div className="flex flex-col items-center">
                            <label className="relative inline-flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                {...register("statusPageEnabled")}
                                disabled={!isPrivileged || isUpdating}
                                className="sr-only peer"
                              />
                              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
                            </label>
                            <span className="text-[10px] text-muted-fg mt-0.5">
                              {statusPageEnabled ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="pt-4 border-t border-border-color flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="text-[11px] text-muted-fg space-y-0.5">
                        <div>
                          Organization ID:{" "}
                          <span className="font-mono text-main-fg select-all">
                            {organization?.id || "—"}
                          </span>
                        </div>
                        <div>
                          Created: {formatOrgCreatedDate(organization?.createdAt)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleCancel}
                          disabled={!isDirty || isUpdating}
                          className="rounded-xl text-xs h-9 px-4"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          isLoading={isUpdating}
                          disabled={!isPrivileged || isUpdating || !isDirty}
                          className="rounded-xl text-xs h-9 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm"
                        >
                          {isUpdating ? "Saving changes..." : "Save changes"}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Danger Zone: Visible only to SUPER_ADMIN */}
                {user?.role === ROLES.SUPER_ADMIN && organization && (
                  <Card className="rounded-2xl border border-rose-200/80 bg-rose-50/20 shadow-xs dark:border-rose-900/30 dark:bg-rose-950/10 overflow-hidden mt-6 max-w-full">
                    <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-rose-100 dark:border-rose-900/20">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 shrink-0">
                          <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-sm sm:text-base font-bold text-rose-950 dark:text-rose-200">
                            Danger Zone
                          </CardTitle>
                          <p className="text-xs text-rose-800/80 dark:text-rose-300/80">
                            Destructive and irreversible organizational actions
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-main-fg">
                          Delete this organization
                        </h4>
                        <p className="text-[11px] text-muted-fg leading-relaxed max-w-xl">
                          Permanently delete <strong className="font-semibold text-main-fg">{organization.name}</strong>, along with all incidents, member accounts, alerts, comments, and settings. Once deleted, this data cannot be recovered.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => setIsDeleteModalOpen(true)}
                        className="rounded-xl text-xs h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white font-medium shrink-0 self-start sm:self-auto shadow-xs"
                      >
                        Delete organization
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </>
              )}

              {/* Tab 2: Members & Teams */}
              {activeTab === "members" && (
                <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm p-4 sm:p-6 space-y-4 max-w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        <Users className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                          Members & Teams
                        </CardTitle>
                        <p className="text-xs text-muted-fg truncate">
                          Manage user invitations, team roles, and on-call assignments
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/members"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-brand-700 transition-colors min-h-[40px] sm:min-h-0 shrink-0"
                    >
                      Open Members Directory <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  <p className="text-xs text-muted-fg leading-relaxed">
                    View active responders, invite engineers, assign roles (Super Admin, Admin, Manager, Developer), and configure team rotations in the Members directory.
                  </p>
                </Card>
              )}

              {/* Tab 3: Security & SSO */}
              {activeTab === "security" && (
                <div className="space-y-6">
                  <PasswordManagementCard />

                  <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm p-4 sm:p-6 space-y-5 max-w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                          Security & SSO
                        </CardTitle>
                        <p className="text-xs text-muted-fg truncate">
                          Session authentication, role credentials, and access control
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-border-color text-xs">
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                          Active User
                        </span>
                        <span className="font-semibold text-main-fg">{user?.name}</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                          Email Address
                        </span>
                        <span className="text-main-fg">{user?.email}</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                          Role Privilege
                        </span>
                        {user?.role && <RoleBadge role={user.role} size="sm" />}
                      </div>
                    </div>

                    <div className="rounded-xl border border-border-color bg-slate-50/50 dark:bg-slate-900/30 p-4 text-xs space-y-2">
                      <div className="flex items-center gap-2 font-semibold text-main-fg">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        Session Policy Active
                      </div>
                      <p className="text-[11px] text-muted-fg leading-relaxed">
                        HttpOnly refresh token rotation enabled with SameSite=Lax security, automatic 7-day token expiry, and strict organization tenant boundary isolation.
                      </p>
                    </div>
                  </Card>
                </div>
              )}

              {/* Tab 4: Integrations */}
              {activeTab === "integrations" && (
                <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm p-4 sm:p-6 space-y-4 max-w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                      <LinkIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                        Integrations
                      </CardTitle>
                      <p className="text-xs text-muted-fg truncate">
                        Connected operational channels and alerting webhooks
                      </p>
                    </div>
                  </div>
                  <div className="divide-y divide-border-color text-xs">
                    <div className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-main-fg">Brevo SMTP Pager</div>
                        <div className="text-[11px] text-muted-fg">Email incident alerting and responder escalation notifications</div>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                        Connected
                      </span>
                    </div>
                    <div className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-main-fg">Slack Incident Bot</div>
                        <div className="text-[11px] text-muted-fg">Dedicated #incident channel creation and responder paging</div>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-full shrink-0">
                        Configured
                      </span>
                    </div>
                    <div className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-main-fg">AI Models (Gemini & Groq)</div>
                        <div className="text-[11px] text-muted-fg">Triage recommendations, status drafts, and postmortem generation</div>
                      </div>
                      <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full shrink-0">
                        Active
                      </span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Tab 5: Billing & Usage */}
              {activeTab === "billing" && (
                <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm p-4 sm:p-6 space-y-4 max-w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                        Billing & Usage
                      </CardTitle>
                      <p className="text-xs text-muted-fg truncate">
                        Subscription tier, incident volume, and API quotas
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-border-color">
                      <span className="text-[11px] text-muted-fg block">Current Plan</span>
                      <span className="text-base font-bold text-main-fg">Enterprise</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-border-color">
                      <span className="text-[11px] text-muted-fg block">Active Incidents Quota</span>
                      <span className="text-base font-bold text-main-fg">Unlimited</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-border-color">
                      <span className="text-[11px] text-muted-fg block">AI Evaluations</span>
                      <span className="text-base font-bold text-main-fg">Included</span>
                    </div>
                  </div>
                </Card>
              )}

              {/* Tab 6: AI & Automation (Preserves Phase 3 settings and submission) */}
              {activeTab === "ai" && (
                <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm max-w-full">
                  <CardHeader className="p-4 sm:p-6 pb-3 sm:pb-4 border-b border-border-color">
                    <div className="flex flex-wrap items-center justify-between gap-3 min-w-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
                          <Sparkles className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
                            AI & Automation
                          </CardTitle>
                          <p className="text-xs text-muted-fg truncate">
                            Configure Phase 3 alert grouping, runbook suggestions, and Cmd+K assistant
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200 dark:border-brand-800 shrink-0">
                        AI-generated
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 sm:p-6 space-y-5">
                    {/* Alert Grouping Toggle (FR-08) */}
                    <div className="rounded-xl border border-border-color bg-slate-50/40 dark:bg-slate-900/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Layers className="h-5 w-5 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-semibold text-main-fg">Alert Grouping (FR-08)</h4>
                            <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                              Group identical or semantically similar incoming alerts into existing open incidents. Exact matches group automatically; ambiguous matches create suggestions for human review.
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input
                            type="checkbox"
                            {...register("aiSettings.alertGrouping")}
                            disabled={!isPrivileged || isUpdating}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
                        </label>
                      </div>

                      {/* Threshold Configuration */}
                      <div className="mt-4 pt-3 border-t border-border-color grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-medium text-main-fg mb-1">
                            Grouping Window (minutes)
                          </label>
                          <Input
                            type="number"
                            {...register("aiSettings.alertGroupingWindowMinutes", { valueAsNumber: true })}
                            disabled={!isPrivileged || isUpdating}
                            min={1}
                            max={1440}
                            className="h-8 text-xs font-mono rounded-lg"
                          />
                          <span className="text-[10px] text-muted-fg mt-0.5 block">
                            Time window after incident creation to attach matching alerts (default: 30m).
                          </span>
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-main-fg mb-1">
                            Similarity Threshold (0.00 – 1.00)
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            {...register("aiSettings.alertGroupingSimilarityThreshold", { valueAsNumber: true })}
                            disabled={!isPrivileged || isUpdating}
                            min={0}
                            max={1}
                            className="h-8 text-xs font-mono rounded-lg"
                          />
                          <span className="text-[10px] text-muted-fg mt-0.5 block">
                            Cosine threshold for AI embedding suggestions (default: 0.82).
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Runbook Suggestions Toggle (FR-11) */}
                    <div className="rounded-xl border border-border-color bg-slate-50/40 dark:bg-slate-900/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <BookOpen className="h-5 w-5 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-semibold text-main-fg">Runbook Suggestions (FR-11)</h4>
                            <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                              Suggest relevant operational runbooks on the Incident Detail page using deterministic keyword, service, and semantic embedding matching.
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input
                            type="checkbox"
                            {...register("aiSettings.runbooks")}
                            disabled={!isPrivileged || isUpdating}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Assistant Toggle (FR-10) */}
                    <div className="rounded-xl border border-border-color bg-slate-50/40 dark:bg-slate-900/30 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3">
                          <Bot className="h-5 w-5 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
                          <div>
                            <h4 className="text-xs font-semibold text-main-fg">Command-Palette Assistant (FR-10)</h4>
                            <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                              Enable read-only conversational inquiries inside the Cmd+K command palette with strict allowlist tool calling and caller RBAC enforcement.
                            </p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                          <input
                            type="checkbox"
                            {...register("aiSettings.assistant")}
                            disabled={!isPrivileged || isUpdating}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* AI Tab Save Button */}
                    <div className="pt-4 border-t border-border-color flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        isLoading={isUpdating}
                        disabled={!isPrivileged || isUpdating || !isDirty}
                        className="rounded-xl text-xs h-9 px-4 bg-brand-600 hover:bg-brand-700 text-white font-medium shadow-sm"
                      >
                        {isUpdating ? "Saving changes..." : "Save changes"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </form>
      )}

      {/* Delete Organization Confirmation Modal */}
      {organization && (
        <DeleteOrganizationModal
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          organization={organization}
        />
      )}
    </div>
  );
};

export default SettingsPage;
