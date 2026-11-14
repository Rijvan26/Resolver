import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AuthShowcase } from "@/components/shared/AuthShowcase";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useRegisterOrganizationMutation, useLoginMutation, useGoogleAuthMutation } from "@/features/auth/authApi";
import { GoogleLogin } from "@react-oauth/google";
import { setCredentials } from "@/features/auth/authSlice";
import { registerOrgSchema, RegisterOrgFormValues } from "@/features/auth/schemas";
import { parseApiError } from "@/lib/apiErrors";

export const RegisterOrgPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate("/dashboard", { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const [registerOrgMutation, { isLoading: isRegistering }] = useRegisterOrganizationMutation();
  const [loginMutation, { isLoading: isLoggingIn }] = useLoginMutation();
  const [googleAuthMutation, { isLoading: isGoogleLoading }] = useGoogleAuthMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterOrgFormValues>({
    resolver: zodResolver(registerOrgSchema),
    defaultValues: {
      organizationName: "",
      creatorName: "",
      email: "",
      slug: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: RegisterOrgFormValues) => {
    setServerError(null);

    try {
      const payload: {
        organizationName: string;
        creatorName: string;
        email: string;
        password: string;
        slug?: string;
      } = {
        organizationName: values.organizationName.trim(),
        creatorName: values.creatorName.trim(),
        email: values.email.trim().toLowerCase(),
        password: values.password,
      };

      if (values.slug && values.slug.trim()) {
        payload.slug = values.slug.trim().toLowerCase();
      }

      const regResponse = await registerOrgMutation(payload).unwrap();

      if (regResponse.success) {
        // Automatically sign in the newly registered super admin
        try {
          const loginResponse = await loginMutation({
            email: payload.email,
            password: payload.password,
          }).unwrap();

          if (loginResponse.success && loginResponse.data) {
            dispatch(
              setCredentials({
                accessToken: loginResponse.data.accessToken,
                user: loginResponse.data.user,
                organization: loginResponse.data.organization,
              })
            );
            navigate("/dashboard", { replace: true });
            return;
          }
        } catch {
          // Fallback redirect to login with notification if auto-login fails
        }

        const successNotice = encodeURIComponent(
          "Organization registered successfully! Please sign in with your credentials."
        );
        navigate(`/login?message=${successNotice}`, { replace: true });
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);

      if (parsed.fieldErrors) {
        Object.entries(parsed.fieldErrors).forEach(([field, msg]) => {
          if (
            field === "organizationName" ||
            field === "creatorName" ||
            field === "email" ||
            field === "slug" ||
            field === "password" ||
            field === "confirmPassword"
          ) {
            setError(field as keyof RegisterOrgFormValues, { message: msg });
          }
        });
      }
    }
  };

  const isPending = isRegistering || isLoggingIn || isSubmitting || isGoogleLoading;

  return (
    <div className="relative min-h-screen flex items-center justify-center p-2 sm:p-3 md:p-4 bg-page text-main-fg overflow-y-auto">
      {/* Centered Expanded Card Container: 20px radius, fills 92vw x 90vh */}
      <main className="relative z-10 w-full md:w-[92vw] max-w-[1360px] min-h-0 md:h-[90vh] md:max-h-[92vh] md:min-h-[560px] bg-card-bg rounded-[20px] p-2 md:p-2.5 border border-border-color shadow-sm flex flex-col md:flex-row overflow-hidden">
        {/* Mobile slim 6px top color strip (hidden on desktop >=768px) */}
        <div
          className="md:hidden h-1.5 w-full flex shrink-0 rounded-t-[16px] overflow-hidden -mt-1 -mx-1 mb-2"
          style={{ width: "calc(100% + 8px)" }}
        >
          <div className="h-full flex-1 bg-[#D92D3A]" />
          <div className="h-full flex-1 bg-[#C98A00]" />
          <div className="h-full flex-1 bg-[#1F9D6B]" />
        </div>

        {/* LEFT PANEL: Animation side with dashboard bg-page background (hidden on mobile <768px) */}
        <AuthShowcase className="hidden md:flex md:w-[48%] lg:w-[46%] h-full" />

        {/* RIGHT PANEL: Clean Registration Form (one input per line, scrollable with hidden scrollbar) */}
        <div className="w-full md:w-[52%] lg:w-[54%] bg-card-bg px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-4 lg:px-10 lg:py-5 flex flex-col overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-w-0 h-full">
          <div className="max-w-[400px] w-full m-auto py-1 space-y-3">
            {/* Header: Starts directly with title */}
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-main-fg">
                Create an Organization
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-fg">
                Set up your organization workspace and Super Admin account.
              </p>
            </div>

            {/* Server error banner */}
            {serverError && (
              <Alert
                variant="error"
                title="Registration Error"
                onDismiss={() => setServerError(null)}
              >
                {serverError}
              </Alert>
            )}

            {/* Registration Form: One input per line */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
              {/* 1. Organization Name */}
              <div>
                <label
                  htmlFor="orgName"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Organization Name
                </label>
                <input
                  id="orgName"
                  type="text"
                  placeholder="Acme Corp"
                  autoComplete="organization"
                  disabled={isPending}
                  className="w-full px-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                  {...register("organizationName")}
                />
                {errors.organizationName?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.organizationName.message}</p>
                )}
              </div>

              {/* 2. Workspace Slug (Optional) */}
              <div>
                <label
                  htmlFor="orgSlug"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Workspace Slug <span className="font-normal text-muted-fg lowercase">(optional)</span>
                </label>
                <input
                  id="orgSlug"
                  type="text"
                  placeholder="acme-corp"
                  autoComplete="off"
                  disabled={isPending}
                  className="w-full px-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                  {...register("slug")}
                />
                {errors.slug?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.slug.message}</p>
                )}
              </div>

              {/* 3. Your Full Name */}
              <div>
                <label
                  htmlFor="creatorName"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Your Full Name
                </label>
                <input
                  id="creatorName"
                  type="text"
                  placeholder="Alex Chen"
                  autoComplete="name"
                  disabled={isPending}
                  className="w-full px-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                  {...register("creatorName")}
                />
                {errors.creatorName?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.creatorName.message}</p>
                )}
              </div>

              {/* 4. Work Email */}
              <div>
                <label
                  htmlFor="regEmail"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Work Email
                </label>
                <input
                  id="regEmail"
                  type="email"
                  placeholder="you@company.com"
                  autoComplete="email"
                  disabled={isPending}
                  className="w-full px-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                  {...register("email")}
                />
                {errors.email?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.email.message}</p>
                )}
              </div>

              {/* 5. Password */}
              <div>
                <label
                  htmlFor="regPassword"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="regPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="At least 8 chars"
                    autoComplete="new-password"
                    disabled={isPending}
                    className="w-full px-3.5 pr-10 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg transition-colors p-1 min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {showPassword ? (
                        <path
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <>
                          <path
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                {errors.password?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.password.message}</p>
                )}
              </div>

              {/* 6. Confirm Password */}
              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                    disabled={isPending}
                    className="w-full px-3.5 pr-10 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                    {...register("confirmPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg transition-colors p-1 min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      viewBox="0 0 24 24"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      {showConfirmPassword ? (
                        <path
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ) : (
                        <>
                          <path
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
                {errors.confirmPassword?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.confirmPassword.message}</p>
                )}
              </div>

              {/* Submit Button: Responsive label & no overflow on mobile */}
              <div className="pt-1.5">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isPending}
                  disabled={isPending}
                  className="w-full h-12 min-h-[48px] rounded-[12px] font-semibold text-xs sm:text-sm cursor-pointer shadow-xs whitespace-normal px-2 sm:px-4"
                >
                  <span>
                    {isPending ? (
                      "Setting up workspace..."
                    ) : (
                      <>
                        <span className="sm:hidden">Create Organization</span>
                        <span className="hidden sm:inline">Create Organization & Workspace</span>
                      </>
                    )}
                  </span>
                </Button>
              </div>
            </form>

            {/* Divider */}
            <div className="relative flex items-center justify-center my-3">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border-color" />
              </div>
              <div className="relative px-3 bg-card-bg text-xs uppercase tracking-wider text-muted-fg font-medium">
                Or sign up with
              </div>
            </div>

            {/* Google Sign-Up */}
            <div className="flex justify-center w-full min-h-[44px]">
              <GoogleLogin
                onSuccess={async (credentialResponse) => {
                  if (credentialResponse.credential) {
                    try {
                      setServerError(null);
                      const orgNameInput = (document.getElementById("organizationName") as HTMLInputElement)?.value;
                      const slugInput = (document.getElementById("slug") as HTMLInputElement)?.value;
                      const response = await googleAuthMutation({
                        idToken: credentialResponse.credential,
                        organizationName: orgNameInput?.trim() || undefined,
                        slug: slugInput?.trim() || undefined,
                      }).unwrap();

                      if (response.success && response.data) {
                        if ("requiresWorkspaceSetup" in response.data) {
                          navigate("/setup-workspace", { state: response.data });
                          return;
                        }

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
                  }
                }}
                onError={() => {
                  setServerError("Google sign-up failed or was cancelled");
                }}
                theme="outline"
                shape="rectangular"
                size="large"
                width="360"
                text="signup_with"
              />
            </div>

            {/* Footer */}
            <div className="pt-2.5 border-t border-border-color text-center">
              <p className="text-xs text-muted-fg">
                Already have an organization workspace?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-main-fg hover:underline ml-1"
                >
                  Sign in
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RegisterOrgPage;
