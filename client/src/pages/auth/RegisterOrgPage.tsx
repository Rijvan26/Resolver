import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldAlert, Building, User, Mail, Lock, Globe, Eye, EyeOff, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { useRegisterOrganizationMutation, useLoginMutation } from "@/features/auth/authApi";
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

  const isPending = isRegistering || isLoggingIn || isSubmitting;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 py-8 dark:bg-slate-950">
      <div className="w-full max-w-lg space-y-6">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-xs dark:bg-brand-500">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-main-fg">
            Create an Organization
          </h1>
          <p className="mt-1.5 text-sm text-muted-fg">
            Set up your organization workspace and Super Admin account
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

        <Card className="border-slate-200/80 shadow-lg dark:border-slate-800">
          <CardHeader>
            <CardTitle>Organization Setup</CardTitle>
            <CardDescription>
              Register your organization name, custom slug, and primary administrator credentials
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              {/* Organization Name */}
              <Input
                label="Organization Name"
                placeholder="Acme Inc."
                autoComplete="organization"
                disabled={isPending}
                leftIcon={<Building className="h-4 w-4" />}
                error={errors.organizationName?.message}
                {...register("organizationName")}
              />

              {/* Custom Slug (Optional) */}
              <Input
                label="Organization Slug (Optional)"
                placeholder="acme-inc"
                helperText="Custom identifier used for URLs and status page (e.g., resolver.app/acme-inc)"
                disabled={isPending}
                leftIcon={<Globe className="h-4 w-4" />}
                error={errors.slug?.message}
                {...register("slug")}
              />

              <div className="my-2 border-t border-border-color" />

              {/* Creator Name */}
              <Input
                label="Administrator Full Name"
                placeholder="Alex Morgan"
                autoComplete="name"
                disabled={isPending}
                leftIcon={<User className="h-4 w-4" />}
                error={errors.creatorName?.message}
                {...register("creatorName")}
              />

              {/* Email */}
              <Input
                label="Corporate Email Address"
                type="email"
                placeholder="alex@acme.com"
                autoComplete="email"
                disabled={isPending}
                leftIcon={<Mail className="h-4 w-4" />}
                error={errors.email?.message}
                {...register("email")}
              />

              {/* Password */}
              <Input
                label="Super Admin Password"
                type={showPassword ? "text" : "password"}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                disabled={isPending}
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="text-muted-fg hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
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

              {/* Confirm Password */}
              <Input
                label="Confirm Password"
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm your password"
                autoComplete="new-password"
                disabled={isPending}
                leftIcon={<Lock className="h-4 w-4" />}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="text-muted-fg hover:text-slate-600 dark:hover:text-slate-200 focus:outline-none"
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
                disabled={isPending}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                {isPending ? "Setting up workspace..." : "Create Organization & Workspace"}
              </Button>

              <div className="mt-2 text-center text-xs text-muted-fg">
                Already have an organization workspace?{" "}
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

export default RegisterOrgPage;
