import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import {
  invitationFormSchema,
  InvitationFormValues,
  ALLOWED_INVITATION_ROLES,
  AllowedInvitationRole,
} from "@/features/invitations/schemas";
import {
  useCreateInvitationMutation,
  useResendInvitationMutation,
} from "@/features/invitations/invitationsApi";
import { Role, ROLES, INVITATION_PERMISSIONS } from "@/types";
import { parseApiError } from "@/lib/apiErrors";
import { Mail, Copy, Check, UserPlus, RefreshCw } from "lucide-react";

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  actorRole: Role;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  actorRole,
}) => {
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const [createInvitation, { isLoading }] = useCreateInvitationMutation();
  const [resendInvitation, { isLoading: isResending }] = useResendInvitationMutation();

  const allowedRoles = (INVITATION_PERMISSIONS[actorRole] || []).filter(
    (r): r is AllowedInvitationRole => ALLOWED_INVITATION_ROLES.includes(r as AllowedInvitationRole)
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<InvitationFormValues>({
    resolver: zodResolver(invitationFormSchema),
    defaultValues: {
      email: "",
      role: (allowedRoles[0] || ROLES.DEVELOPER) as AllowedInvitationRole,
    },
  });

  const handleModalClose = () => {
    reset();
    setServerError(null);
    setCreatedLink(null);
    setCreatedId(null);
    setEmailFailed(false);
    setResendSuccess(false);
    setCopied(false);
    onClose();
  };

  const onSubmit = async (values: InvitationFormValues) => {
    setServerError(null);
    setEmailFailed(false);
    setResendSuccess(false);

    try {
      const result = await createInvitation({
        email: values.email,
        role: values.role,
      }).unwrap();

      if (result.data?.id) {
        setCreatedId(result.data.id);
      }

      if (result.data?.invitationLink) {
        setCreatedLink(result.data.invitationLink);
      }

      if (result.data?.emailSent === false || result.warning || result.data?.warning) {
        setEmailFailed(true);
      } else if (!result.data?.invitationLink) {
        handleModalClose();
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  const handleResend = async () => {
    if (!createdId) return;
    setServerError(null);
    try {
      const res = await resendInvitation(createdId).unwrap();
      if (res.data?.invitationLink) {
        setCreatedLink(res.data.invitationLink);
      }
      if (res.data?.emailSent === false || res.warning || res.data?.warning) {
        setEmailFailed(true);
        setResendSuccess(false);
      } else {
        setEmailFailed(false);
        setResendSuccess(true);
      }
    } catch (err: unknown) {
      const parsed = parseApiError(err);
      setServerError(parsed.message);
    }
  };

  const handleCopyLink = async () => {
    if (!createdLink) return;
    try {
      await navigator.clipboard.writeText(createdLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleModalClose}
      title={
        emailFailed
          ? "Email could not be sent"
          : createdLink
          ? "Invitation Link Ready"
          : "Invite Team Member"
      }
      description={
        emailFailed
          ? "The invitation was created, but delivery failed. You can copy the link or resend."
          : createdLink
          ? "Share this direct link with the invited member"
          : "Send an email invitation to join your organization"
      }
      size="md"
    >
      <div className="space-y-4 mt-2">
        {serverError && (
          <Alert variant="error" onDismiss={() => setServerError(null)}>
            {serverError}
          </Alert>
        )}

        {createdLink ? (
          <div className="space-y-4">
            {emailFailed ? (
              <Alert variant="warning" title="Email could not be sent">
                The invitation has been generated, but the email could not be sent automatically. You can copy the invite link below to send manually, or click Resend.
              </Alert>
            ) : resendSuccess ? (
              <Alert variant="success" title="Email Resent Successfully">
                The invitation email was resent to the member.
              </Alert>
            ) : (
              <Alert variant="success" title="Invitation Created">
                An invitation has been created. In this environment, you can copy the direct registration link below:
              </Alert>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-main-fg">
                Invitation Link
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={createdLink}
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 focus:outline-none"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  leftIcon={copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  className="shrink-0 text-xs"
                >
                  {copied ? "Copied" : "Copy invite link"}
                </Button>
                {createdId && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResend}
                    isLoading={isResending}
                    disabled={isResending}
                    leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
                    className="shrink-0 text-xs"
                  >
                    Resend
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border-color">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setCreatedLink(null);
                  setCreatedId(null);
                  setEmailFailed(false);
                  setResendSuccess(false);
                  reset();
                }}
                className="text-xs"
              >
                Invite Another
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleModalClose}
                className="text-xs"
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-main-fg">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="colleague@example.com"
                {...register("email")}
                error={errors.email?.message}
                disabled={isLoading}
                leftIcon={<Mail className="h-4 w-4 text-muted-fg" />}
              />
            </div>

            {/* Role Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-main-fg">
                Assigned Role
              </label>
              <Select
                {...register("role")}
                error={errors.role?.message}
                disabled={isLoading}
              >
                {allowedRoles.map((role) => (
                  <option key={role} value={role}>
                    {role.replace("_", " ")}
                  </option>
                ))}
              </Select>
              <p className="text-[11px] text-muted-fg">
                Select the organizational role for the invited member.
              </p>
            </div>

            {/* Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-color">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleModalClose}
                disabled={isLoading}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isLoading}
                disabled={isLoading}
                leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                className="text-xs"
              >
                {isLoading ? "Sending..." : "Send Invitation"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
};

export default InviteMemberModal;
