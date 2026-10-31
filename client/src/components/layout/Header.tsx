import React from "react";
import { Link } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { toggleSidebar, setTheme } from "@/app/uiSlice";
import { UserMenu } from "./UserMenu";
import { Menu, Bell, Sun, Moon } from "lucide-react";

export interface HeaderProps {
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ unreadCount = 0 }) => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);

  const toggleTheme = () => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    dispatch(setTheme(isDark ? "light" : "dark"));
  };

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/85 sm:px-6">
      {/* Left section: Hamburger toggle & System Status */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none transition-colors"
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden sm:flex items-center gap-2 pl-2 text-xs text-slate-500 dark:text-slate-400 border-l border-slate-200 dark:border-slate-800">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-medium tracking-tight">Systems Operational</span>
        </div>
      </div>

      {/* Right section: Theme toggle, Notifications, User Menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none transition-colors"
          title="Toggle Light/Dark Theme"
          aria-label="Toggle Light/Dark Theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4.5 w-4.5 text-amber-400" />
          ) : (
            <Moon className="h-4.5 w-4.5 text-slate-600" />
          )}
        </button>

        {/* Notifications Icon with Badge */}
        <Link
          to="/notifications"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:outline-none transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4.5 w-4.5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-slate-900 tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 sm:mx-1" />

        {/* User profile dropdown */}
        <UserMenu />
      </div>
    </header>
  );
};

