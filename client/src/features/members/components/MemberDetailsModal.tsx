import React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Member, Role, MEMBER_MODIFICATION_TARGET_PERMISSIONS } from "@/types";
import { useGetMemberQuery } from "@/features/members/membersApi";
import { Skeleton } from "@/components/ui/skeleton";
import { Mail } from "lucide-react";

export interface MemberDetailsModalProps {
  memberId: string | null;
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  currentUserRole?: Role;
  onChangeRole?: (member: Member) => void;
  onToggleStatus?: (member: Member) => void;
}

export const MemberDetailsModal: React.FC<MemberDetailsModalProps> = ({
  memberId,
  isOpen,
  onClose,
  currentUserId,
  currentUserRole,
  onChangeRole,
  onToggleStatus,
}) => {
  const { data, isLoading } = useGetMemberQuery(memberId || "", {
    skip: !memberId || !isOpen,
  });

  const member = data?.data;

  if (!isOpen) return null;

  const canModify =
    Boolean(member) &&
    currentUserId !== member?.id &&
    Boolean(currentUserRole) &&
    (MEMBER_MODIFICATION_TARGET_PERMISSIONS[currentUserRole as Role] || []).includes(
      member?.role as Role
    );

  const initials = member?.name
    ? member.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "U";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Member Details"
      description="Organization member profile and access level"
      size="md"
    >
      <div className="space-y-5 mt-2">
        {isLoading || !member ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        ) : (
          <>
            {/* Header profile info */}
            <div className="flex items-center gap-4 rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-900/40">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-main-fg truncate">
                    {member.name}
                  </h4>
                  <RoleBadge role={member.role} size="sm" />
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate mt-0.5">
                  <Mail className="h-3.5 w-3.5 text-muted-fg" />
                  <span>{member.email}</span>
                </div>
              </div>
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    member.isActive
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      member.isActive ? "bg-emerald-500" : "bg-rose-500"
                    }`}
                  />
                  {member.isActive ? "Active" : "Deactivated"}
                </span>
              </div>
            </div>

            {/* Properties List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                  User ID
                </span>
                <span className="font-mono text-main-fg text-[11px] select-all">
                  {member.id}
                </span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                  Organization ID
                </span>
                <span className="font-mono text-main-fg text-[11px] select-all">
                  {member.organizationId}
                </span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                  Joined Organization
                </span>
                <span className="text-main-fg">
                  {new Date(member.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-fg block mb-1">
                  Last Updated
                </span>
                <span className="text-main-fg">
                  {member.updatedAt
                    ? new Date(member.updatedAt).toLocaleString()
                    : new Date(member.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-border-color">
              <div className="flex items-center gap-2">
                {canModify && onChangeRole && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onChangeRole(member);
                    }}
                    className="text-xs"
                  >
                    Change Role
                  </Button>
                )}
                {canModify && onToggleStatus && (
                  <Button
                    type="button"
                    variant={member.isActive ? "outline" : "primary"}
                    size="sm"
                    onClick={() => {
                      onClose();
                      onToggleStatus(member);
                    }}
                    className="text-xs"
                  >
                    {member.isActive ? "Deactivate" : "Activate"}
                  </Button>
                )}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

export default MemberDetailsModal;

