import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppDispatch } from "@/app/hooks";
import { logoutState } from "@/features/auth/authSlice";
import { api } from "@/services/api";
import {
  useGetDeletePreviewQuery,
  useDeleteOrganizationMutation,
} from "../organizationApi";
import { Organization } from "@/types";
import { parseApiError } from "@/lib/apiErrors";
import {
  AlertTriangle,
  Lock,
  Building,
  Users,
  AlertCircle,
  FileText,
  Activity as ActivityIcon,
  Bell,
  Mail,
  ShieldAlert,
} from "lucide-react";

export interface DeleteOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  organization: Organization;
}

export const DeleteOrganizationModal: React.FC<DeleteOrganizationModalProps> = ({
  isOpen,
  onClose,
  organization,
}) => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();

  const [typedName, setTypedName] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch preview counts (members, incidents, alerts, services, etc.)
  const {
    data: previewData,
    isLoading: isPreviewLoading,
    isError: isPreviewError,
  } = useGetDeletePreviewQuery(organization.id, {
    skip: !isOpen,
  });

  const [deleteOrganization, { isLoading: isDeleting }] =
    useDeleteOrganizationMutation();

  // Reset form inputs when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setTypedName("");
      setPassword("");
      setErrorMessage(null);
    }
  }, [isOpen]);

  const counts = previewData?.data?.counts;
  const isNameMatched = typedName.trim() === organization.name.trim();
  const canConfirm = isNameMatched && password.trim().length > 0 && !isDeleting;

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canConfirm) return;

    setErrorMessage(null);

    try {
      await deleteOrganization({
        id: organization.id,
        organizationName: typedName.trim(),
        password,
      }).unwrap();

      // Successfully deleted: reset RTK Query cache, wipe auth credentials, and redirect
      dispatch(api.util.resetApiState());
      dispatch(logoutState());
      onClose();
      navigate("/register", {
        replace: true,
        state: {
          deletionNotice: `Organization '${organization.name}' was successfully deleted.`,
        },
      });
    } catch (err) {
      const parsed = parseApiError(err);
      setErrorMessage(parsed.message || "Failed to delete organization. Please verify your credentials.");
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isDeleting ? () => { } : onClose}
      title="Delete Organization"
      description="Permanent removal of organization and all associated data"
      size="lg"
    >
      <form onSubmit={handleDelete} className="space-y-5">
        {/* Warning Banner */}
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 shrink-0 mt-0.5">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-rose-900 dark:text-rose-200">
                Warning: This action is permanent and cannot be undone
              </h4>
              <p className="text-[11px] leading-relaxed text-rose-700 dark:text-rose-300/90">
                Deleting <strong className="font-semibold">{organization.name}</strong> will
                immediately cascade and delete all incidents, member accounts, alerts,
                comments, and integrations. Active sessions for all members will be revoked.
              </p>
            </div>
          </div>
        </div>

        {/* Error message if API returns 401, 403, 400 */}
        {errorMessage && (
          <Alert variant="error" className="rounded-xl text-xs py-2.5">
            {errorMessage}
          </Alert>
        )}

        {/* Preview of items to be deleted */}
        <div className="space-y-2">
          <span className="text-xs font-semibold text-main-fg block">
            Items to be cascade deleted
          </span>

          {isPreviewLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 rounded-xl" />
              ))}
            </div>
          ) : isPreviewError || !counts ? (
            <div className="rounded-xl border border-border-color bg-slate-50/60 p-3 text-[11px] text-muted-fg dark:bg-slate-900/30">
              Unable to load resource preview counts.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <Users className="h-3 w-3 text-brand-600 dark:text-brand-400" />
                  <span>Members</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.members}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <AlertCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                  <span>Incidents</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.incidents}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <Building className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Services</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.services}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <Bell className="h-3 w-3 text-amber-600 dark:text-amber-400" />
                  <span>Alerts</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.alerts}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <FileText className="h-3 w-3 text-sky-600 dark:text-sky-400" />
                  <span>Comments</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.comments}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <ActivityIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                  <span>Activities</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.activities}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <Mail className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                  <span>Invitations</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {counts.invitations}
                </div>
              </div>

              <div className="rounded-xl border border-border-color bg-card-bg p-2.5">
                <div className="flex items-center gap-1.5 text-[10px] text-muted-fg">
                  <ShieldAlert className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                  <span>Total Data</span>
                </div>
                <div className="text-base font-bold text-main-fg font-mono tabular-nums mt-0.5">
                  {previewData?.data?.totalRecords || 0}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Re-authentication & Exact Name Confirmation */}
        <div className="space-y-4 pt-1 border-t border-border-color">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-main-fg block">
              Type the exact organization name to confirm:{" "}
              <span className="font-mono text-brand-600 dark:text-brand-400 font-bold select-all">
                {organization.name}
              </span>
            </label>
            <Input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={organization.name}
              disabled={isDeleting}
              autoComplete="off"
              className="rounded-xl h-10 text-xs font-medium"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-main-fg flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 text-muted-fg" />
              <span>Enter your Super Admin password to re-authenticate</span>
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your current account password"
              disabled={isDeleting}
              autoComplete="current-password"
              className="rounded-xl h-10 text-xs font-medium"
            />
          </div>
        </div>

        {/* Modal Actions */}
        <div className="pt-4 border-t border-border-color flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeleting}
            className="rounded-xl text-xs h-9 px-4"
          >
            Cancel
          </Button>

          <Button
            type="submit"
            variant="danger"
            isLoading={isDeleting}
            disabled={!canConfirm}
            className="rounded-xl text-xs h-9 px-5 bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? "Deleting organization..." : "Delete this organization"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default DeleteOrganizationModal;

