import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import {
  Building,
  Globe,
  Save,
  Lock,
  User,
} from "lucide-react";

export const SettingsPage: React.FC = () => {
  const { user, organization: authOrg } = useAppSelector((state) => state.auth);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

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
    formState: { errors, isDirty },
  } = useForm<UpdateOrganizationFormValues>({
    resolver: zodResolver(updateOrganizationFormSchema),
    defaultValues: {
      name: organization?.name || "",
      statusPageEnabled: organization?.statusPageEnabled || false,
    },
  });

  // Keep form in sync when organization query loads
  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        statusPageEnabled: organization.statusPageEnabled ?? false,
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
      }).unwrap();

      setSuccessMessage("Organization settings have been updated successfully.");
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-main-fg">
          Organization Settings
        </h1>
        <p className="text-xs text-muted-fg mt-1">
          Manage your organization details, public status page, and security profile
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
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
          <p>Failed to load organization settings.</p>
          <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2 text-xs">
            Retry
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Organization Details Card */}
          <Card>
            <CardHeader className="pb-4 border-b border-border-color">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    <Building className="h-4 w-4" />
                  </div>
                  <div>
                    <CardTitle className="text-sm font-semibold">General Profile</CardTitle>
                    <p className="text-[11px] text-slate-500">
                      Primary organizational identity and slug
                    </p>
                  </div>
                </div>

                {!isPrivileged && (
                  <span className="flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-muted-fg">
                    <Lock className="h-3 w-3" /> Read Only
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="p-6 space-y-5">
              {/* Org Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-main-fg">
                  Organization Name
                </label>
                <Input
                  {...register("name")}
                  error={errors.name?.message}
                  disabled={!isPrivileged || isUpdating}
                  placeholder="Acme Corporation"
                />
                <p className="text-[11px] text-muted-fg">
                  The display name of your organization visible to team members.
                </p>
              </div>

              {/* Org Slug (Read-only) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-main-fg">
                  Organization Slug
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    value={organization?.slug || ""}
                    disabled
                    readOnly
                    className="bg-slate-50 font-mono text-xs dark:bg-slate-900"
                  />
                </div>
                <p className="text-[11px] text-muted-fg">
                  Unique immutable URL identifier assigned during organization creation.
                </p>
              </div>

              {/* Status Page Feature Toggle */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <Globe className="h-5 w-5 text-brand-600 dark:text-brand-400 mt-0.5 shrink-0" />
                    <div>
                      <h4 className="text-xs font-semibold text-main-fg">
                        Public Status Page
                      </h4>
                      <p className="text-[11px] text-muted-fg mt-0.5 leading-relaxed">
                        Allow stakeholders to view system incident status and live service health without signing in.
                      </p>
                    </div>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                    <input
                      type="checkbox"
                      {...register("statusPageEnabled")}
                      disabled={!isPrivileged || isUpdating}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-brand-600"></div>
                  </label>
                </div>
              </div>

              {/* Read-Only Org Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-border-color text-xs">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-0.5">
                    Organization ID
                  </span>
                  <span className="font-mono text-main-fg select-all">
                    {organization?.id}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-0.5">
                    Created At
                  </span>
                  <span className="text-main-fg">
                    {organization?.createdAt
                      ? new Date(organization.createdAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Current User Session Profile Card */}
          <Card>
            <CardHeader className="pb-3 border-b border-border-color">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <User className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-sm font-semibold">Your Session Profile</CardTitle>
                  <p className="text-[11px] text-slate-500">
                    Current user credentials and role privileges
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                    Name
                  </span>
                  <span className="font-semibold text-main-fg">
                    {user?.name}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                    Email
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
            </CardContent>
          </Card>

          {/* Save Button for Privileged Users */}
          {isPrivileged && (
            <div className="flex items-center justify-end gap-3">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isUpdating}
                disabled={isUpdating || !isDirty}
                leftIcon={<Save className="h-4 w-4" />}
                className="text-xs"
              >
                {isUpdating ? "Saving Changes..." : "Save Settings"}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
};

export default SettingsPage;
