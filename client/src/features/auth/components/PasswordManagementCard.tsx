import React, { useState } from "react";
import { useAppSelector } from "@/app/hooks";
import { useSetPasswordMutation } from "../authApi";
import { parseApiError } from "@/lib/apiErrors";
import { Card, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { KeyRound, Eye, EyeOff, ShieldCheck, CheckCircle2 } from "lucide-react";

export const PasswordManagementCard: React.FC = () => {
  const { user } = useAppSelector((state) => state.auth);
  const [setPasswordMutation, { isLoading }] = useSetPasswordMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const hasPassword = Boolean(user?.hasPassword);

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};

    if (hasPassword && !currentPassword) {
      errors.currentPassword = "Your current password is required";
    }

    if (!newPassword) {
      errors.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      errors.newPassword = "Password must be at least 8 characters long";
    } else if (newPassword.length > 128) {
      errors.newPassword = "Password cannot exceed 128 characters";
    }

    if (hasPassword && currentPassword && newPassword === currentPassword) {
      errors.newPassword = "New password cannot be the same as your current password";
    }

    if (confirmPassword !== newPassword) {
      errors.confirmPassword = "Passwords do not match";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    setSuccessMessage(null);

    if (!validate()) {
      return;
    }

    try {
      const res = await setPasswordMutation({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      }).unwrap();

      setSuccessMessage(
        res.message ||
          (hasPassword
            ? "Your password has been updated successfully."
            : "Password created successfully! You can now sign in using your email and password.")
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
    } catch (err) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
      if (parsed.fieldErrors) {
        setFieldErrors((prev) => ({ ...prev, ...parsed.fieldErrors }));
      }
    }
  };

  return (
    <Card className="rounded-2xl border border-border-color bg-card-bg shadow-sm p-4 sm:p-6 space-y-5 max-w-full">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300 shrink-0">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <CardTitle className="text-[15px] sm:text-base font-bold text-main-fg truncate">
            {hasPassword ? "Change Password" : "Create Account Password"}
          </CardTitle>
          <p className="text-xs text-muted-fg truncate">
            {hasPassword
              ? "Update your existing account password"
              : "Enable email & password sign-in for your Google-authenticated account"}
          </p>
        </div>
      </div>

      {/* Account Authentication Status Banner */}
      {!hasPassword ? (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3.5 text-xs text-sky-950 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-200 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
            Google OAuth Sign-In Active
          </div>
          <p className="text-[11px] text-sky-800 dark:text-sky-300 leading-relaxed">
            Your account currently signs in using Google and does not have a password configured. Setting a password enables you to log in with either Google or your email address and password.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border-color bg-slate-50/50 dark:bg-slate-900/30 p-3.5 text-xs space-y-1">
          <div className="flex items-center gap-2 font-semibold text-main-fg">
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
            Password Authentication Configured
          </div>
          <p className="text-[11px] text-muted-fg leading-relaxed">
            Your account has a password enabled. You can update it anytime using your current password.
          </p>
        </div>
      )}

      {/* Alerts */}
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

      <form onSubmit={handleSubmit} className="space-y-4 pt-1">
        {hasPassword && (
          <Input
            label="Current Password"
            type={showCurrentPassword ? "text" : "password"}
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              if (fieldErrors.currentPassword) {
                setFieldErrors((prev) => ({ ...prev, currentPassword: undefined }));
              }
            }}
            placeholder="Enter your current password"
            error={fieldErrors.currentPassword}
            disabled={isLoading}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="text-muted-fg hover:text-main-fg focus:outline-none transition-colors"
                tabIndex={-1}
                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={hasPassword ? "New Password" : "Create Password"}
            type={showNewPassword ? "text" : "password"}
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              if (fieldErrors.newPassword) {
                setFieldErrors((prev) => ({ ...prev, newPassword: undefined }));
              }
            }}
            placeholder="Min. 8 characters"
            helperText={!fieldErrors.newPassword ? "Must be 8 to 128 characters" : undefined}
            error={fieldErrors.newPassword}
            disabled={isLoading}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="text-muted-fg hover:text-main-fg focus:outline-none transition-colors"
                tabIndex={-1}
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Input
            label="Confirm Password"
            type={showConfirmPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (fieldErrors.confirmPassword) {
                setFieldErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }
            }}
            placeholder="Repeat password"
            error={fieldErrors.confirmPassword}
            disabled={isLoading}
            rightIcon={
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="text-muted-fg hover:text-main-fg focus:outline-none transition-colors"
                tabIndex={-1}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </div>

        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            variant="primary"
            size="md"
            isLoading={isLoading}
            disabled={isLoading}
          >
            {hasPassword ? "Update Password" : "Set Password"}
          </Button>
        </div>
      </form>
    </Card>
  );
};
