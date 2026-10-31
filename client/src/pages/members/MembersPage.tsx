import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import {
  useGetMembersQuery,
} from "@/features/members/membersApi";
import {
  useListInvitationsQuery,
} from "@/features/invitations/invitationsApi";
import {
  Member,
  Invitation,
  Role,
  ROLES,
  MEMBER_MODIFICATION_TARGET_PERMISSIONS,
} from "@/types";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InviteMemberModal } from "@/features/invitations/components/InviteMemberModal";
import { RevokeInvitationModal } from "@/features/invitations/components/RevokeInvitationModal";
import { ChangeRoleModal } from "@/features/members/components/ChangeRoleModal";
import { ChangeMemberStatusModal } from "@/features/members/components/ChangeMemberStatusModal";
import { MemberDetailsModal } from "@/features/members/components/MemberDetailsModal";
import { formatRelativeTime } from "@/features/dashboard/dashboardUtils";
import {
  Users,
  UserPlus,
  Mail,
  Search,
  Filter,
  ShieldAlert,
  UserCheck,
  UserX,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Clock,
} from "lucide-react";

export const MembersPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user: currentUser } = useAppSelector((state) => state.auth);

  // Tab State: "members" or "invitations"
  const activeTab = searchParams.get("tab") === "invitations" ? "invitations" : "members";

  // Members filters from URL
  const page = parseInt(searchParams.get("page") || "1", 10);
  const search = searchParams.get("search") || "";
  const role = (searchParams.get("role") as Role) || undefined;
  const status = (searchParams.get("status") as "active" | "deactivated") || undefined;

  // Search input state with debouncing
  const [searchInput, setSearchInput] = useState(search);

  // Modal states
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [memberForRole, setMemberForRole] = useState<Member | null>(null);
  const [memberForStatus, setMemberForStatus] = useState<Member | null>(null);
  const [memberForDetailsId, setMemberForDetailsId] = useState<string | null>(null);
  const [invitationForRevoke, setInvitationForRevoke] = useState<Invitation | null>(null);

  // Sync search input if URL changes externally
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounced search sync to URL
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput.trim()) {
            next.set("search", searchInput.trim());
          } else {
            next.delete("search");
          }
          next.set("page", "1");
          return next;
        });
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchInput, search, setSearchParams]);

  // Queries
  const {
    data: membersData,
    isLoading: isLoadingMembers,
    isFetching: isFetchingMembers,
    isError: isMembersError,
    refetch: refetchMembers,
  } = useGetMembersQuery({
    page,
    limit: 10,
    search: search || undefined,
    role,
    status,
  });

  const isPrivileged =
    currentUser?.role === ROLES.SUPER_ADMIN || currentUser?.role === ROLES.ADMIN;

  const {
    data: invitationsData,
    isLoading: isLoadingInvitations,
    isError: isInvitationsError,
    refetch: refetchInvitations,
  } = useListInvitationsQuery(undefined, {
    skip: !isPrivileged,
  });

  const members = membersData?.data?.members || [];
  const pagination = membersData?.data?.pagination;
  const totalMembers = pagination?.total || 0;

  const invitations = invitationsData?.data || [];
  const pendingInvitations = useMemo(
    () => invitations.filter((i) => i.status === "PENDING"),
    [invitations]
  );

  const handleTabChange = (tab: "members" | "invitations") => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === "invitations") {
        next.set("tab", "invitations");
      } else {
        next.delete("tab");
      }
      return next;
    });
  };

  const handleRoleFilterChange = (newRole: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newRole && newRole !== "ALL") {
        next.set("role", newRole);
      } else {
        next.delete("role");
      }
      next.set("page", "1");
      return next;
    });
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newStatus && newStatus !== "ALL") {
        next.set("status", newStatus);
      } else {
        next.delete("status");
      }
      next.set("page", "1");
      return next;
    });
  };

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("page", newPage.toString());
      return next;
    });
  };

  const canModifyMember = (targetMember: Member): boolean => {
    if (!currentUser) return false;
    if (currentUser.id === targetMember.id) return false;
    const allowedTargets = MEMBER_MODIFICATION_TARGET_PERMISSIONS[currentUser.role] || [];
    return allowedTargets.includes(targetMember.role);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Team Members & Access
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage organization members, assignments, invitations, and role-based permissions
          </p>
        </div>

        {isPrivileged && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsInviteOpen(true)}
            leftIcon={<UserPlus className="h-4 w-4" />}
            className="text-xs"
          >
            Invite Member
          </Button>
        )}
      </div>

      {/* Main card with navigation tabs */}
      <Card>
        <div className="border-b border-slate-200 px-6 pt-3 dark:border-slate-800">
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => handleTabChange("members")}
              className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-semibold transition-colors ${
                activeTab === "members"
                  ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                  : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Users className="h-4 w-4" />
              Members
              <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {totalMembers}
              </span>
            </button>

            {isPrivileged && (
              <button
                type="button"
                onClick={() => handleTabChange("invitations")}
                className={`flex items-center gap-2 border-b-2 pb-3 text-xs font-semibold transition-colors ${
                  activeTab === "invitations"
                    ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Mail className="h-4 w-4" />
                Pending Invitations
                {pendingInvitations.length > 0 && (
                  <span className="ml-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    {pendingInvitations.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        <CardContent className="p-4 sm:p-6 space-y-4">
          {activeTab === "members" ? (
            <>
              {/* Filter controls row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px] max-w-md">
                  <Input
                    placeholder="Search members by name or email..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    leftIcon={<Search className="h-4 w-4 text-slate-400" />}
                    className="text-xs h-9"
                  />
                </div>

                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-slate-400" />
                    <Select
                      value={role || "ALL"}
                      onChange={(e) => handleRoleFilterChange(e.target.value)}
                      className="text-xs h-9 py-0 px-2 min-w-[130px]"
                    >
                      <option value="ALL">All Roles</option>
                      <option value={ROLES.SUPER_ADMIN}>Super Admin</option>
                      <option value={ROLES.ADMIN}>Admin</option>
                      <option value={ROLES.MANAGER}>Manager</option>
                      <option value={ROLES.DEVELOPER}>Developer</option>
                    </Select>
                  </div>

                  <Select
                    value={status || "ALL"}
                    onChange={(e) => handleStatusFilterChange(e.target.value)}
                    className="text-xs h-9 py-0 px-2 min-w-[120px]"
                  >
                    <option value="ALL">All Status</option>
                    <option value="active">Active</option>
                    <option value="deactivated">Deactivated</option>
                  </Select>
                </div>
              </div>

              {/* Members Table */}
              {isLoadingMembers ? (
                <div className="space-y-3 pt-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : isMembersError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                  <p>Failed to load organization members.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchMembers()}
                    className="mt-2 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              ) : members.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />}
                    title="No members found"
                    description={
                      search || role || status
                        ? "No team members matched your current filter criteria."
                        : "No members found in your organization."
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Member</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Joined Date</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {members.map((member) => {
                        const isSelf = currentUser?.id === member.id;
                        const canModify = canModifyMember(member);
                        const initials = member.name
                          ? member.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase()
                          : "U";

                        return (
                          <tr
                            key={member.id}
                            className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors"
                          >
                            {/* Member info */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                                  {initials}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
                                    <span className="truncate">{member.name}</span>
                                    {isSelf && (
                                      <span className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                        You
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate">
                                    {member.email}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Role */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <RoleBadge role={member.role} size="sm" />
                            </td>

                            {/* Status */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  member.isActive
                                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    member.isActive ? "bg-emerald-500" : "bg-rose-500"
                                  }`}
                                />
                                {member.isActive ? "Active" : "Deactivated"}
                              </span>
                            </td>

                            {/* Joined Date */}
                            <td className="py-3.5 px-4 whitespace-nowrap text-slate-500">
                              <span title={new Date(member.createdAt).toLocaleString()}>
                                {formatRelativeTime(member.createdAt)}
                              </span>
                            </td>

                            {/* Actions */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setMemberForDetailsId(member.id)}
                                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
                                  title="View details"
                                  aria-label="View details"
                                >
                                  <Eye className="h-4 w-4" />
                                </button>

                                {canModify && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setMemberForRole(member)}
                                      className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800 dark:hover:text-brand-400 transition-colors"
                                      title="Change role"
                                      aria-label="Change role"
                                    >
                                      <ShieldAlert className="h-4 w-4" />
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() => setMemberForStatus(member)}
                                      className={`rounded p-1.5 text-slate-400 transition-colors ${
                                        member.isActive
                                          ? "hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                                          : "hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-400"
                                      }`}
                                      title={member.isActive ? "Deactivate account" : "Reactivate account"}
                                      aria-label={member.isActive ? "Deactivate account" : "Reactivate account"}
                                    >
                                      {member.isActive ? (
                                        <UserX className="h-4 w-4" />
                                      ) : (
                                        <UserCheck className="h-4 w-4" />
                                      )}
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination controls */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                  <span className="text-slate-500">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} total members)
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || isFetchingMembers}
                      onClick={() => handlePageChange(Math.max(page - 1, 1))}
                      className="h-8 text-xs"
                    >
                      <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= pagination.totalPages || isFetchingMembers}
                      onClick={() => handlePageChange(Math.min(page + 1, pagination.totalPages))}
                      className="h-8 text-xs"
                    >
                      Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Invitations Tab */
            <>
              {isLoadingInvitations ? (
                <div className="space-y-3 pt-2">
                  <Skeleton className="h-12 w-full rounded-xl" />
                  <Skeleton className="h-12 w-full rounded-xl" />
                </div>
              ) : isInvitationsError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-6 text-center text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                  <p>Failed to load invitations.</p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetchInvitations()}
                    className="mt-2 text-xs"
                  >
                    Retry
                  </Button>
                </div>
              ) : pendingInvitations.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<Mail className="h-10 w-10 text-slate-300 dark:text-slate-600" />}
                    title="No pending invitations"
                    description="All invitations have been accepted or no active invitations exist."
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setIsInviteOpen(true)}
                        leftIcon={<UserPlus className="h-4 w-4" />}
                        className="text-xs mt-2"
                      >
                        Invite Team Member
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-800">
                      <tr>
                        <th className="py-3 px-4">Invited Email</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Invited By</th>
                        <th className="py-3 px-4">Sent Date</th>
                        <th className="py-3 px-4">Expires</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {pendingInvitations.map((inv) => (
                        <tr
                          key={inv.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors"
                        >
                          <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-white">
                            {inv.email}
                          </td>
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <RoleBadge role={inv.role} size="sm" />
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                            {inv.inviter?.name || "Admin"}
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            <span title={new Date(inv.createdAt).toLocaleString()}>
                              {formatRelativeTime(inv.createdAt)}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-slate-400" />
                              <span title={new Date(inv.expiresAt).toLocaleString()}>
                                {formatRelativeTime(inv.expiresAt)}
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setInvitationForRevoke(inv)}
                              className="h-7 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                              leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            >
                              Revoke
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      {currentUser && (
        <InviteMemberModal
          isOpen={isInviteOpen}
          onClose={() => setIsInviteOpen(false)}
          actorRole={currentUser.role}
        />
      )}

      {currentUser && (
        <ChangeRoleModal
          member={memberForRole}
          isOpen={Boolean(memberForRole)}
          onClose={() => setMemberForRole(null)}
          actorRole={currentUser.role}
        />
      )}

      <ChangeMemberStatusModal
        member={memberForStatus}
        isOpen={Boolean(memberForStatus)}
        onClose={() => setMemberForStatus(null)}
      />

      <MemberDetailsModal
        memberId={memberForDetailsId}
        isOpen={Boolean(memberForDetailsId)}
        onClose={() => setMemberForDetailsId(null)}
        currentUserId={currentUser?.id}
        currentUserRole={currentUser?.role}
        onChangeRole={(m) => setMemberForRole(m)}
        onToggleStatus={(m) => setMemberForStatus(m)}
      />

      <RevokeInvitationModal
        invitation={invitationForRevoke}
        isOpen={Boolean(invitationForRevoke)}
        onClose={() => setInvitationForRevoke(null)}
      />
    </div>
  );
};

export default MembersPage;
