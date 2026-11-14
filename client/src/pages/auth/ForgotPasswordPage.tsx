import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AuthShowcase } from "@/components/shared/AuthShowcase";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useForgotPasswordMutation } from "@/features/auth/authApi";
import { parseApiError } from "@/lib/apiErrors";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Please enter a valid work email address"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const ForgotPasswordPage: React.FC = () => {
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation();
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (values: ForgotPasswordFormValues) => {
    setServerError(null);
    try {
      await forgotPassword({ email: values.email }).unwrap();
      setSubmittedEmail(values.email);
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
            {submittedEmail ? (
              /* Success State */
              <div className="space-y-5 text-center sm:text-left">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-main-fg">
                    Check your email
                  </h1>
                  <p className="mt-2 text-xs sm:text-sm text-muted-fg leading-relaxed">
                    If an account is associated with{" "}
                    <span className="font-semibold text-main-fg">{submittedEmail}</span>,
                    we've dispatched a password reset link.
                  </p>
                </div>

                <div className="rounded-xl border border-border-color bg-slate-50/60 dark:bg-slate-900/40 p-4 text-xs text-muted-fg space-y-1">
                  <p className="font-medium text-main-fg">Didn't receive the email?</p>
                  <p className="leading-relaxed">
                    Check your spam folder or make sure you entered the email address registered with your organization.
                  </p>
                </div>

                <div className="pt-2 flex flex-col gap-2.5">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setSubmittedEmail(null)}
                  >
                    Try another email address
                  </Button>
                  <Link
                    to="/login"
                    className="inline-flex items-center justify-center text-xs font-semibold text-muted-fg hover:text-main-fg transition-colors py-2"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to sign in
                  </Link>
                </div>
              </div>
            ) : (
              /* Request Form */
              <div className="space-y-4">
                <div>
                  <Link
                    to="/login"
                    className="inline-flex items-center text-xs font-semibold text-muted-fg hover:text-main-fg transition-colors mb-3"
                  >
                    <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back to sign in
                  </Link>
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-main-fg">
                    Reset your password
                  </h1>
                  <p className="mt-1 text-xs sm:text-sm text-muted-fg">
                    Enter your account email address and we will send you a secure link to reset your password.
                  </p>
                </div>

                {serverError && (
                  <Alert
                    variant="error"
                    title="Error"
                    onDismiss={() => setServerError(null)}
                  >
                    {serverError}
                  </Alert>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-1">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="email"
                      className="block text-xs font-semibold text-main-fg"
                    >
                      Work Email
                    </label>
                    <div className="relative">
                      <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        autoFocus
                        disabled={isLoading}
                        placeholder="name@company.com"
                        className="w-full pl-10 pr-3.5 h-12 min-h-[48px] bg-card-bg dark:bg-slate-900 border border-border-color rounded-[12px] text-sm text-main-fg placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-ink/20 dark:focus:ring-white/20 focus:border-ink dark:focus:border-white transition-all disabled:opacity-60"
                        {...register("email")}
                      />
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-fg pointer-events-none" />
                    </div>
                    {errors.email && (
                      <p className="text-xs text-red-500 font-medium">
                        {errors.email.message}
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
                    Send Reset Link
                  </Button>
                </form>

                <p className="text-center text-xs text-muted-fg pt-2">
                  Remember your password?{" "}
                  <Link
                    to="/login"
                    className="font-semibold text-main-fg hover:underline"
                  >
                    Sign in
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

export default ForgotPasswordPage;
