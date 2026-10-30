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
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/80 sm:px-6">
      {/* Left section: Hamburger toggle */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
          aria-label="Toggle Sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Right section: Theme toggle, Notifications, User Menu */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
          title="Toggle Light/Dark Theme"
          aria-label="Toggle Light/Dark Theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-slate-600" />
          )}
        </button>

        {/* Notifications Icon with Badge */}
        <Link
          to="/notifications"
          className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-slate-900 animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

        {/* User profile dropdown */}
        <UserMenu />
      </div>
    </header>
  );
};

