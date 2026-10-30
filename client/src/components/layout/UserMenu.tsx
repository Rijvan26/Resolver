import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAppSelector } from "@/app/hooks";
import { useLogoutMutation } from "@/features/auth/authApi";
import { RoleBadge } from "@/components/shared/RoleBadge";
import { User, Settings, LogOut, Building, ChevronDown, Loader2 } from "lucide-react";

export const UserMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, organization } = useAppSelector((state) => state.auth);
  const [logoutMutation, { isLoading: isLoggingOut }] = useLogoutMutation();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    try {
      await logoutMutation().unwrap();
    } catch {
      // Auth slice & cache are already reset in logout mutation lifecycle
    } finally {
      setIsOpen(false);
      navigate("/login", { replace: true });
    }
  };

  if (!user) return null;

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2.5 rounded-full p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white shadow-sm ring-2 ring-white dark:bg-brand-500 dark:ring-slate-900">
          {initials || <User className="w-4 h-4" />}
        </div>
        <div className="hidden text-left md:block">
          <div className="text-xs font-semibold leading-none text-slate-800 dark:text-slate-100">
            {user.name}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {organization?.name || "Workspace"}
          </div>
        </div>
        <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* User info header */}
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <div className="font-semibold text-slate-900 dark:text-white truncate">
              {user.name}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <RoleBadge role={user.role} size="sm" />
            </div>
          </div>

          {/* Org context */}
          {organization && (
            <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
              <Building className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                {organization.name}
              </span>
            </div>
          )}

          <div className="my-1 border-t border-slate-100 dark:border-slate-800" />

          {/* Actions */}
          <div className="space-y-0.5">
            <Link
              to="/settings"
              onClick={() => setIsOpen(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <Settings className="h-4 w-4 text-slate-400" />
              Organization & Profile Settings
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-50"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isLoggingOut ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
