import React, { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShowcase } from "@/components/shared/AuthShowcase";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useResetPasswordMutation } from "@/features/auth/authApi";
import { parseApiError } from "@/lib/apiErrors";
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters long")
      .max(128, "Password cannot exceed 128 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export const ResetPasswordPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [resetPassword, { isLoading }] = useResetPasswordMutation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  // Countdown redirect on success
  useEffect(() => {
    if (!isSuccess) return;

    if (countdown <= 0) {
      navigate("/login", { replace: true, state: { message: "Password reset successfully. You can now log in." } });
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isSuccess, countdown, navigate]);

  const onSubmit = async (values: ResetPasswordFormValues) => {
    setServerError(null);

    if (!token) {
      setServerError("Reset token is missing. Please use the link provided in your email.");
      return;
    }

    try {
      await resetPassword({
        token,
        newPassword: values.password,
      }).unwrap();
      setIsSuccess(true);
    } catch (err) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-2 sm:p-3 md:p-4 bg-page text-main-fg overflow-y-auto">
      {/* Centered Expanded Card Container */}
      <main className="relative z-10 w-full md:w-[92vw] max-w-[1360px] min-h-0 md:h-[90vh] md:max-h-[92vh] md:min-h-[560px] bg-card-bg rounded-[20px] p-2 md:p-2.5 border border-border-color shadow-sm flex flex-col md:flex-row overflow-hidden">
        {/* Mobile slim top color strip */}
        <div
          className="md:hidden h-1.5 w-full flex shrink-0 rounded-t-[16px] overflow-hidden -mt-1 -mx-1 mb-2"
          style={{ width: "calc(100% + 8px)" }}
        >
          <div className="h-full flex-1 bg-[#D92D3A]" />
          <div className="h-full flex-1 bg-[#C98A00]" />
          <div className="h-full flex-1 bg-[#1F9D6B]" />
        </div>

        {/* LEFT PANEL: Animation showcase */}
        <AuthShowcase className="hidden md:flex md:w-[48%] lg:w-[46%] h-full" />

        {/* RIGHT PANEL: Clean Form */}
        <div className="w-full md:w-[52%] lg:w-[54%] bg-card-bg px-4 py-6 sm:px-6 sm:py-8 md:px-8 md:py-8 lg:px-10 lg:py-10 flex flex-col justify-center overflow-y-auto min-w-0 h-full">
          <div className="max-w-[400px] w-full m-auto py-2 space-y-5">
            {!token ? (
              /* Missing Token Screen */
              <div className="space-y-4 text-center sm:text-left">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main-fg">
                    Invalid Reset Link
                  </h1>
                  <p className="mt-2 text-xs sm:text-sm text-muted-fg leading-relaxed">
                    This password reset link is invalid or incomplete. Please request a new link from the forgot password page.
                  </p>
                </div>
                <div className="pt-2">
                  <Link to="/forgot-password">
                    <Button variant="primary" className="w-full">
                      Request a new reset link
                    </Button>
                  </Link>
                </div>
              </div>
            ) : isSuccess ? (
              /* Success Screen */
              <div className="space-y-5 text-center sm:text-left">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main-fg">
                    Password Reset Complete
                  </h1>
                  <p className="mt-2 text-xs sm:text-sm text-muted-fg leading-relaxed">
                    Your password has been securely updated. Redirecting you to sign in in{" "}
                    <span className="font-semibold text-main-fg">{countdown}s</span>...
                  </p>
                </div>
                <div className="pt-2">
                  <Link to="/login">
                    <Button variant="primary" className="w-full" rightIcon={<ArrowRight className="h-4 w-4" />}>
                      Sign in now
                    </Button>
                  </Link>
                </div>
              </div>
            ) : (
              /* Form */
              <div className="space-y-4">
                <div>
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 mb-3">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-main-fg">
                    Create new password
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-muted-fg">
                    Your new password must be at least 8 characters long.
                  </p>
                </div>

                {serverError && (
                  <Alert
                    variant="error"
                    title="Reset Failed"
                    onDismiss={() => setServerError(null)}
                  >
                    {serverError}
                    <div className="mt-2">
                      <Link
                        to="/forgot-password"
                        className="text-xs font-semibold text-rose-700 dark:text-rose-300 underline"
                      >
                        Request another reset link &rarr;
                      </Link>
                    </div>
                  </Alert>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
                  {/* New Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="password"
                      className="block text-xs font-semibold text-main-fg"
                    >
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        autoFocus
                        disabled={isLoading}
                        placeholder="Min. 8 characters"
                        className="w-full pl-3.5 pr-11 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                        {...register("password")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg transition-colors focus:outline-none p-1 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.password && (
                      <p className="text-xs text-red-500 font-medium">
                        {errors.password.message}
                      </p>
                    )}
                  </div>

                  {/* Confirm Password */}
                  <div className="space-y-1.5">
                    <label
                      htmlFor="confirmPassword"
                      className="block text-xs font-semibold text-main-fg"
                    >
                      Confirm New Password
                    </label>
                    <div className="relative">
                      <input
                        id="confirmPassword"
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        disabled={isLoading}
                        placeholder="Repeat new password"
                        className="w-full pl-3.5 pr-11 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                        {...register("confirmPassword")}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-fg hover:text-main-fg transition-colors focus:outline-none p-1 min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {errors.confirmPassword && (
                      <p className="text-xs text-red-500 font-medium">
                        {errors.confirmPassword.message}
                      </p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    isLoading={isLoading}
                    disabled={isLoading}
                    className="w-full h-12"
                  >
                    Reset Password
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-fg pt-2">
                  <Link
                    to="/login"
                    className="font-semibold text-main-fg hover:underline"
                  >
                    &larr; Back to sign in
                  </Link>
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResetPasswordPage;
