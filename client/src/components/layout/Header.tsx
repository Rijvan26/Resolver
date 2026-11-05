import React from "react";
import { Link, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { toggleSidebar, setTheme, setCommandPaletteOpen } from "@/app/uiSlice";
import { UserMenu } from "./UserMenu";
import { Menu, Bell, Sun, Moon, Search, Plus } from "lucide-react";

export interface HeaderProps {
  unreadCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ unreadCount = 0 }) => {
  const dispatch = useAppDispatch();
  const theme = useAppSelector((state) => state.ui.theme);
  const { user } = useAppSelector((state) => state.auth);
  const location = useLocation();

  const toggleTheme = () => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    dispatch(setTheme(isDark ? "light" : "dark"));
  };

  // Determine contextual greeting / title
  const getPageInfo = () => {
    const path = location.pathname;
    if (path.startsWith("/incidents/new")) {
      return { title: "Declare Incident", subtitle: "Submit a new operational incident response" };
    }
    if (path.startsWith("/incidents/")) {
      return { title: "Incident Details", subtitle: "Active investigation and responder timeline" };
    }
    if (path.startsWith("/incidents")) {
      return { title: "Incidents", subtitle: "Active triage, alerts, and operational response" };
    }
    if (path.startsWith("/members")) {
      return { title: "Team Members", subtitle: "On-call rotation, responder roles and active loads" };
    }
    if (path.startsWith("/notifications")) {
      return { title: "Notifications", subtitle: "Pager alerts, escalations, and incident audit log" };
    }
    if (path.startsWith("/settings")) {
      return { title: "Settings", subtitle: "Organization preferences, integrations, and roles" };
    }

    // Default dashboard
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    return {
      title: greeting,
      subtitle: `${user?.name ? user.name.split(" ")[0] : "Responder"} · System operations dashboard`,
    };
  };

  const { title, subtitle } = getPageInfo();

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 w-full items-center justify-between bg-page px-2.5 sm:px-6 transition-colors">
      {/* ================================================================
          LEFT SECTION: Mobile hamburger + Desktop greeting / page title
          ================================================================ */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Mobile Hamburger toggle */}
        <div className="flex items-center lg:hidden">
          <button
            onClick={() => dispatch(toggleSidebar())}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card-bg text-main-fg shadow-xs hover:bg-pill-hover focus-visible:ring-2 focus-visible:ring-accent transition-colors"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        </div>

        {/* Desktop Page Title + Subtitle */}
        <div className="hidden lg:flex flex-col justify-center">
          <h1 className="text-xl font-bold tracking-tight text-main-fg leading-tight">
            {title}
          </h1>
          <p className="text-xs text-muted-fg leading-none mt-0.5 truncate max-w-md">
            {subtitle}
          </p>
        </div>
      </div>

      {/* ================================================================
          RIGHT SECTION: Search (Desktop + Mobile!), Declare, Theme, Bell, UserMenu
          ================================================================ */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        {/*
          1. Desktop Workable Search Pill (md:flex)
          Clicking opens the Cmd+K Command Palette
        */}
        <button
          type="button"
          onClick={() => dispatch(setCommandPaletteOpen(true))}
          className="hidden md:flex items-center gap-2 rounded-pill bg-card-bg px-3.5 py-1.5 shadow-xs text-xs text-muted-fg border border-border-color/60 hover:border-accent hover:text-main-fg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          title="Search incidents, services, or run commands (Ctrl+K)"
        >
          <Search className="h-3.5 w-3.5 text-muted-fg" />
          <span className="pr-2 text-muted-fg hover:text-main-fg">Search incidents, services...</span>
          <kbd className="rounded bg-pill px-1.5 py-0.5 text-[10px] font-semibold text-muted-fg border border-border-color">
            Ctrl K
          </kbd>
        </button>

        {/*
          2. Mobile Search Icon Button (md:hidden)
          Ensures mobile users have direct 1-tap search functionality
        */}
        <button
          type="button"
          onClick={() => dispatch(setCommandPaletteOpen(true))}
          className="flex md:hidden h-8 w-8 items-center justify-center rounded-full bg-card-bg text-main-fg shadow-xs hover:bg-pill-hover focus-visible:ring-2 focus-visible:ring-accent transition-colors shrink-0"
          title="Search incidents, services (Ctrl+K)"
          aria-label="Search incidents and commands"
        >
          <Search className="h-4 w-4 text-main-fg" />
        </button>

        {/* 3. Theme Toggle (Sun/Moon in rounded circle) */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-card-bg text-main-fg shadow-xs hover:bg-pill-hover focus-visible:ring-2 focus-visible:ring-accent transition-colors shrink-0"
          title="Toggle light/dark theme"
          aria-label="Toggle light/dark theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4 text-sev-p3" />
          ) : (
            <Moon className="h-4 w-4 text-main-fg" />
          )}
        </button>

        {/*
          4. Declare Incident Button:
          - Mobile (<sm): Compact 32px red circle button with ONLY "+" icon
          - Desktop (>=sm): Full pill button with text "Declare incident"
        */}
        <Link
          to="/incidents/new"
          className="flex h-8 w-8 sm:h-10 sm:w-auto items-center justify-center rounded-full sm:rounded-pill bg-sev-p1 text-white shadow-xs transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sev-p1 focus-visible:ring-offset-2 shrink-0 sm:px-4"
          title="Declare new incident"
          aria-label="Declare new incident"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="hidden sm:inline text-xs sm:text-sm font-semibold ml-1.5">
            Declare incident
          </span>
        </Link>

        {/* 5. Notifications Icon with Badge */}
        <Link
          to="/notifications"
          className="relative flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-full bg-card-bg text-main-fg shadow-xs hover:bg-pill-hover focus-visible:ring-2 focus-visible:ring-accent transition-colors shrink-0"
          title="Notifications"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 sm:top-1 sm:right-1 flex h-3.5 min-w-[14px] sm:h-4 sm:min-w-[16px] items-center justify-center rounded-full bg-sev-p1 px-1 text-[9px] sm:text-[10px] font-bold text-white tabular-nums">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>

        {/* 6. User profile dropdown */}
        <UserMenu />
      </div>
    </header>
  );
};

export default Header;
