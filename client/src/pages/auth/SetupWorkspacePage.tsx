import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AuthShowcase } from "@/components/shared/AuthShowcase";
import { useAppDispatch } from "@/app/hooks";
import { useCompleteGoogleSetupMutation, GoogleWorkspaceSetupData } from "@/features/auth/authApi";
import { setCredentials } from "@/features/auth/authSlice";
import { parseApiError } from "@/lib/apiErrors";
import { slugify } from "@/lib/utils";

export const SetupWorkspacePage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const setupData = location.state as GoogleWorkspaceSetupData | undefined;

  useEffect(() => {
    if (!setupData || !setupData.setupToken) {
      navigate("/login", { replace: true });
    }
  }, [setupData, navigate]);

  const [orgName, setOrgName] = useState(setupData?.suggestedOrgName || "");
  const [slug, setSlug] = useState(setupData?.suggestedSlug || "");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [clientSlugError, setClientSlugError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const [completeSetup, { isLoading }] = useCompleteGoogleSetupMutation();

  const handleOrgNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOrgName(val);
    if (!isSlugManuallyEdited) {
      setSlug(slugify(val) || "");
      setClientSlugError(null);
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugManuallyEdited(true);
    const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
    setSlug(cleaned);
    if (cleaned.length < 2) {
      setClientSlugError("Slug must be at least 2 characters");
    } else {
      setClientSlugError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const cleanOrgName = orgName.trim();
    const cleanSlug = slug.trim().toLowerCase();

    if (!cleanOrgName || cleanOrgName.length < 2) {
      setServerError("Organization name must be at least 2 characters");
      return;
    }

    if (!cleanSlug || cleanSlug.length < 2) {
      setClientSlugError("Workspace URL slug must be at least 2 characters");
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cleanSlug)) {
      setClientSlugError("Slug can only contain lowercase letters, numbers, and hyphens");
      return;
    }

    try {
      const response = await completeSetup({
        setupToken: setupData!.setupToken,
        organizationName: cleanOrgName,
        slug: cleanSlug,
      }).unwrap();

      if (response.success && response.data) {
        dispatch(
          setCredentials({
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken,
            user: response.data.user,
            organization: response.data.organization,
          })
        );
        navigate("/dashboard", { replace: true });
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  if (!setupData) {
    return null;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-2 sm:p-3 md:p-4 bg-page text-main-fg overflow-y-auto">
      <main className="relative z-10 w-full md:w-[92vw] max-w-[1360px] min-h-0 md:h-[90vh] md:max-h-[92vh] md:min-h-[560px] bg-card-bg rounded-[20px] p-2 md:p-2.5 border border-border-color shadow-sm flex flex-col md:flex-row overflow-hidden">
        {/* Mobile top strip */}
        <div
          className="md:hidden h-1.5 w-full flex shrink-0 rounded-t-[16px] overflow-hidden -mt-1 -mx-1 mb-2"
          style={{ width: "calc(100% + 8px)" }}
        >
          <div className="h-full flex-1 bg-[#D92D3A]" />
          <div className="h-full flex-1 bg-[#C98A00]" />
          <div className="h-full flex-1 bg-[#1F9D6B]" />
        </div>

        {/* Left Showcase Side */}
        <AuthShowcase className="hidden md:flex md:w-[48%] lg:w-[46%] h-full" />

        {/* Right Form Side */}
        <div className="w-full md:w-[52%] lg:w-[54%] bg-card-bg px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-6 lg:px-10 lg:py-8 flex flex-col overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-w-0 h-full">
          <div className="max-w-[420px] w-full m-auto py-2 space-y-4">
            {/* User welcome header */}
            <div className="flex items-center gap-3 pb-2 border-b border-border-color">
              {setupData.user.avatarUrl ? (
                <img
                  src={setupData.user.avatarUrl}
                  alt={setupData.user.name}
                  className="w-10 h-10 rounded-full border border-border-color"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 flex items-center justify-center font-bold text-sm">
                  {setupData.user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-fg truncate">Signed in as {setupData.user.email}</p>
                <h2 className="text-sm font-semibold text-main-fg truncate">Welcome, {setupData.user.name}!</h2>
              </div>
            </div>

            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main-fg">
                Set up your workspace
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-fg leading-relaxed">
                Choose a name and a clean URL for your team to get started. You can also change this later in Settings.
              </p>
            </div>

            {serverError && (
              <Alert variant="error" title="Setup Error" onDismiss={() => setServerError(null)}>
                {serverError}
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Organization Name Input */}
              <div className="space-y-1.5">
                <label htmlFor="orgName" className="block text-xs font-semibold text-main-fg">
                  Organization / Team Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  value={orgName}
                  onChange={handleOrgNameChange}
                  placeholder="e.g. Acme Corporation"
                  className="w-full px-3.5 py-2.5 rounded-[12px] bg-field border border-border-color text-main-fg placeholder:text-muted-fg text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
                  required
                />
                <p className="text-[11px] text-muted-fg">The display name of your team visible to members.</p>
              </div>

              {/* Workspace URL Slug Input */}
              <div className="space-y-1.5">
                <label htmlFor="slug" className="block text-xs font-semibold text-main-fg">
                  Workspace URL Slug
                </label>
                <div className="flex items-center rounded-[12px] bg-field border border-border-color overflow-hidden focus-within:ring-2 focus-within:ring-brand-500/30 focus-within:border-brand-500 transition-all">
                  <span className="px-3 text-xs text-muted-fg bg-slate-100 dark:bg-slate-900/60 py-2.5 border-r border-border-color select-none">
                    resolver.app/
                  </span>
                  <input
                    id="slug"
                    type="text"
                    value={slug}
                    onChange={handleSlugChange}
                    placeholder="acme-corp"
                    className="flex-1 px-3 py-2.5 bg-transparent text-main-fg placeholder:text-muted-fg text-xs sm:text-sm font-mono focus:outline-none"
                    required
                  />
                </div>
                {clientSlugError && (
                  <p className="text-xs text-[#D92D3A]">{clientSlugError}</p>
                )}
                <p className="text-[11px] text-muted-fg">
                  Unique identifier used in your team URL and status pages.
                </p>
              </div>

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isLoading}
                  disabled={isLoading}
                  className="w-full h-12 min-h-[48px] rounded-[12px] font-semibold text-sm cursor-pointer shadow-xs"
                >
                  <span>{isLoading ? "Creating workspace..." : "Create Workspace & Continue →"}</span>
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SetupWorkspacePage;
