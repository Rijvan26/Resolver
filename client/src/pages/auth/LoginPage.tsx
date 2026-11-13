import React, { useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { AuthShowcase } from "@/components/shared/AuthShowcase";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useLoginMutation } from "@/features/auth/authApi";
import { setCredentials } from "@/features/auth/authSlice";
import { loginSchema, LoginFormValues } from "@/features/auth/schemas";
import { parseApiError } from "@/lib/apiErrors";

export const LoginPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { isAuthenticated } = useAppSelector((state) => state.auth);

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Read success message from query params (e.g. after invitation acceptance)
  const successMessage = searchParams.get("message");

  // Destination route after login
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || "/dashboard";

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, from]);

  const [loginMutation, { isLoading }] = useLoginMutation();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: LoginFormValues) => {
    setServerError(null);

    try {
      const response = await loginMutation({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      }).unwrap();

      if (response.success && response.data) {
        // Synchronously initialize credentials in Redux
        dispatch(
          setCredentials({
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken,
            user: response.data.user,
            organization: response.data.organization,
          })
        );
        navigate(from, { replace: true });
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);

      // Attach any field-specific validation errors from backend
      if (parsed.fieldErrors) {
        Object.entries(parsed.fieldErrors).forEach(([field, msg]) => {
          if (field === "email" || field === "password") {
            setError(field, { message: msg });
          }
        });
      }
    }
  };

  const isPending = isLoading || isSubmitting;

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

        {/* RIGHT PANEL: Clean Form with full dashboard theme colors */}
        <div className="w-full md:w-[52%] lg:w-[54%] bg-card-bg px-4 py-3 sm:px-6 sm:py-4 md:px-8 md:py-4 lg:px-10 lg:py-5 flex flex-col overflow-y-auto no-scrollbar [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-w-0 h-full">
          <div className="max-w-[400px] w-full m-auto py-1 space-y-3.5">
            {/* Header: Starts directly with clean page title */}
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-main-fg">
                Log in to your account
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-muted-fg">
                Welcome back! Enter your details to get you back in.
              </p>
            </div>

            {/* Success notification banner from URL */}
            {successMessage && !serverError && (
              <Alert variant="success" title="Success">
                {successMessage}
              </Alert>
            )}

            {/* Server error banner */}
            {serverError && (
              <Alert
                variant="error"
                title="Authentication Error"
                onDismiss={() => setServerError(null)}
              >
                {serverError}
              </Alert>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5" noValidate>
              {/* Work Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1.5"
                >
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  disabled={isPending}
                  placeholder="you@company.com"
                  className="w-full px-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                  {...register("email")}
                />
                {errors.email?.message && (
                  <p className="mt-1 text-xs text-[#D92D3A]">{errors.email.message}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-[11px] font-semibold text-main-fg uppercase tracking-wider mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    disabled={isPending}
                    placeholder="Enter your password"
                    className="w-full px-3.5 pr-11 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                    {...register("password")}
                  />
                  <button
                    id="toggle-password"
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg transition-colors focus:outline-none p-1 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
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

              {/* Primary Button: Dashboard app primary theme button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isPending}
                  disabled={isPending}
                  className="w-full h-12 min-h-[48px] rounded-[12px] font-semibold text-sm cursor-pointer shadow-xs"
                >
                  <span>{isPending ? "Signing in..." : "Log in"}</span>
                </Button>
              </div>
            </form>

            {/* Footer */}
            <div className="pt-3 border-t border-border-color text-center">
              <p className="text-xs text-muted-fg">
                Don&apos;t have an organization account?{" "}
                <Link
                  to="/register-organization"
                  className="font-semibold text-main-fg hover:underline ml-1"
                >
                  Register organization
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default LoginPage;
