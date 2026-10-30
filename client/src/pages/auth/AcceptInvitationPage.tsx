import React, { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert, User, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAcceptInvitationMutation } from "@/features/auth/authApi";
import { acceptInvitationSchema, AcceptInvitationFormValues } from "@/features/auth/schemas";
import { parseApiError } from "@/lib/apiErrors";

export const AcceptInvitationPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [acceptInvitationMutation, { isLoading }] = useAcceptInvitationMutation();

  const isTokenMissing = !token.trim();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      token: token,
      name: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const onSubmit = async (values: AcceptInvitationFormValues) => {
    setServerError(null);

    if (isTokenMissing) {
      setServerError("Invitation token is missing. Please use the complete link from your invitation email.");
      return;
    }

    try {
      const response = await acceptInvitationMutation({
        token: values.token.trim(),
        name: values.name.trim(),
        password: values.password,
      }).unwrap();

      if (response.success) {
        // Backend provisions the account without auto-logging in, so redirect to login with confirmation
        const successNotice = encodeURIComponent(
          "Your invitation was accepted and your account has been provisioned! Please sign in with your credentials."
        );
        navigate(`/login?message=${successNotice}`, { replace: true });
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);

      if (parsed.fieldErrors) {
        Object.entries(parsed.fieldErrors).forEach(([field, msg]) => {
          if (field === "name" || field === "password" || field === "confirmPassword" || field === "token") {
            setError(field as keyof AcceptInvitationFormValues, { message: msg });
          }
        });
      }
    }
  };

  const isPending = isLoading || isSubmitting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-500/20 dark:bg-brand-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Accept Invitation
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Activate your account and join your team on Resolver
          </p>
        </div>

        {/* Warning if token parameter is absent from the URL */}
        {isTokenMissing && (
          <Alert
            variant="warning"
            title="Missing Invitation Token"
          >
            No invitation token was detected in the URL. Please ensure you clicked the exact link sent to your email.
          </Alert>
        )}

        {/* Server error banner */}
        {serverError && (
          <Alert
            variant="error"
            title="Invitation Error"
            onDismiss={() => setServerError(null)}
          >
            {serverError}
          </Alert>
        )}

        <Card className="border-slate-200/80 shadow-lg dark:border-slate-800">
          <CardHeader>
            <CardTitle>Welcome to the Team</CardTitle>
            <CardDescription>
              Set up your profile name and create a secure password to activate your account
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <input type="hidden" {...register("token")} value={token} />

            <CardContent className="space-y-4">
              <Input
                label="Full Name"
                placeholder="Jordan Lee"
                autoComplete="name"
                disabled={isPending || isTokenMissing}
                leftIcon={<User className="h-4 w-4" />}
                error={errors.name?.message}
                {...register("name")}
              />

              <Input
                label="Create Password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={isPending || isTokenMissing}
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                error={errors.password?.message}
                {...register("password")}
              />

              <Input
                label="Confirm Password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                autoComplete="new-password"
                disabled={isPending || isTokenMissing}
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                }
                error={errors.confirmPassword?.message}
                {...register("confirmPassword")}
              />
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full"
                isLoading={isPending}
                disabled={isPending || isTokenMissing}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {isPending ? "Activating account..." : "Accept & Activate Account"}
              </Button>

              <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                Already activated your account?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  Sign in
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default AcceptInvitationPage;
