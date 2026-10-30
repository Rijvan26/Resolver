import React, { useState } from "react";
import { Link, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert, Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-md shadow-brand-500/20 dark:bg-brand-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Sign in to Resolver
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Multi-Tenant Incident Management Platform
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

        <Card className="border-slate-200/80 shadow-lg dark:border-slate-800">
          <CardHeader>
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>
              Enter your corporate credentials to access your organization workspace
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <Input
                label="Email address"
                type="email"
                placeholder="name@company.com"
                autoComplete="email"
                disabled={isPending}
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                {...register("email")}
              />

              <Input
                label="Password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                disabled={isPending}
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
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-2">
              <Button
                type="submit"
                className="w-full"
                isLoading={isPending}
                disabled={isPending}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {isPending ? "Signing in..." : "Sign In"}
              </Button>

              <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
                Need to register a new organization?{" "}
                <Link
                  to="/register-organization"
                  className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
                >
                  Register Organization
                </Link>
              </div>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
};

export default LoginPage;
