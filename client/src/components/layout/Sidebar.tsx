import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setSidebarOpen } from "@/app/uiSlice";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  AlertTriangle,
  Users,
  Bell,
  Settings,
  ShieldAlert,
  Building,
  X,
} from "lucide-react";

export interface NavItem {
  title: string;
  path: string;
  icon: React.ReactNode;
  badge?: number | string;
}

export interface SidebarProps {
  unreadNotificationCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ unreadNotificationCount = 0 }) => {
  const dispatch = useAppDispatch();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const { organization } = useAppSelector((state) => state.auth);
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      title: "Dashboard",
      path: "/dashboard",
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
    },
    {
      title: "Incidents",
      path: "/incidents",
      icon: <AlertTriangle className="w-4 h-4 shrink-0" />,
    },
    {
      title: "Team Members",
      path: "/members",
      icon: <Users className="w-4 h-4 shrink-0" />,
    },
    {
      title: "Notifications",
      path: "/notifications",
      icon: <Bell className="w-4 h-4 shrink-0" />,
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
    },
    {
      title: "Settings",
      path: "/settings",
      icon: <Settings className="w-4 h-4 shrink-0" />,
    },
  ];

  const handleNavClick = () => {
    // On small screens, close sidebar when clicking a link
    if (window.innerWidth < 1024) {
      dispatch(setSidebarOpen(false));
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={() => dispatch(setSidebarOpen(false))}
        />
      )}

      {/* Sidebar container */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200/80 bg-white transition-all duration-300 dark:border-slate-800/80 dark:bg-slate-900 lg:static lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:w-0 lg:overflow-hidden lg:border-none"
        )}
      >
        {/* Brand header */}
        <div className="flex h-16 items-center justify-between px-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm dark:bg-brand-500">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                Resolver
              </span>
              <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                PRO
              </span>
            </div>
          </div>
          <button
            onClick={() => dispatch(setSidebarOpen(false))}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Organization identity pill */}
        {organization && (
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-950/40">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-200/70 text-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0">
                <Building className="h-3.5 w-3.5" />
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {organization.name}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {organization.slug}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation list */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Navigation
          </div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-all group",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-semibold shadow-xs dark:bg-brand-950/70 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "transition-colors",
                      isActive
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                    )}
                  >
                    {item.icon}
                  </span>
                  <span>{item.title}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white shadow-xs">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="border-t border-slate-100 p-4 dark:border-slate-800 text-[11px] text-slate-400 text-center">
          Resolver Platform v1.0
        </div>
      </aside>
    </>
  );
};

