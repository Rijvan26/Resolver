import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setSidebarOpen, setCommandPaletteOpen } from "@/app/uiSlice";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  AlertTriangle,
  Users,
  Bell,
  Settings,
  X,
  Search,
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

/**
 * Signature Notch Tab SVG
 * Exact inverse fillets (20px concave corners) where the tab meets the 72px sidebar,
 * with a 28px rounded pill cap on the left, protruding 16px past the right edge into the page.
 * Uses reactive fill color: #ECECE8 in light theme, #0E0E10 in dark theme.
 */
const NotchTabSvg: React.FC<{ isDark: boolean }> = ({ isDark }) => (
  <svg
    className="absolute pointer-events-none select-none transition-colors duration-200"
    style={{
      top: -20,
      left: 0,
      width: 92,
      height: 96,
      zIndex: 1,
    }}
    viewBox="0 0 92 96"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M 72 0 A 20 20 0 0 0 52 20 L 36 20 A 28 28 0 0 0 36 76 L 52 76 A 20 20 0 0 0 72 96 L 92 96 L 92 0 Z"
      fill={isDark ? "#0E0E10" : "#ECECE8"}
    />
  </svg>
);

export const Sidebar: React.FC<SidebarProps> = ({ unreadNotificationCount = 0 }) => {
  const dispatch = useAppDispatch();
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const theme = useAppSelector((state) => state.ui.theme);
  const { organization } = useAppSelector((state) => state.auth);
  const location = useLocation();

  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  const navItems: NavItem[] = [
    {
      title: "Dashboard",
      path: "/dashboard",
      icon: <LayoutGrid className="w-5 h-5 shrink-0" />,
    },
    {
      title: "Incidents",
      path: "/incidents",
      icon: <AlertTriangle className="w-5 h-5 shrink-0" />,
    },
    {
      title: "Team Members",
      path: "/members",
      icon: <Users className="w-5 h-5 shrink-0" />,
    },
    {
      title: "Notifications",
      path: "/notifications",
      icon: <Bell className="w-5 h-5 shrink-0" />,
      badge: unreadNotificationCount > 0 ? unreadNotificationCount : undefined,
    },
    {
      title: "Settings",
      path: "/settings",
      icon: <Settings className="w-5 h-5 shrink-0" />,
    },
  ];

  const handleClose = () => {
    dispatch(setSidebarOpen(false));
  };

  const handleOpenSearch = () => {
    handleClose();
    dispatch(setCommandPaletteOpen(true));
  };

  return (
    <>
      {/* ====================================================================
          MOBILE DRAWER BACKDROP & FLYOUT
          ==================================================================== */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Mobile Drawer (width 260px, spacious, clear text labels + icons) */}
      <aside
        className={cn(
          "fixed top-0 bottom-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-white shadow-2xl transition-transform duration-300 ease-out lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-white font-bold text-lg shadow-sm">
              R
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white">Resolver</div>
              <div className="text-xs text-sidebar-icon truncate max-w-[130px]">
                {organization?.name || "Incident Ops"}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-icon hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile Search bar right inside drawer */}
        <div className="p-3 pb-1">
          <button
            type="button"
            onClick={handleOpenSearch}
            className="flex w-full items-center gap-2.5 rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-sidebar-icon hover:bg-white/10 hover:text-white transition-colors text-left"
          >
            <Search className="h-4 w-4 shrink-0 text-sidebar-icon" />
            <span className="flex-1 truncate">Search incidents, services...</span>
            <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-white/60">
              Ctrl K
            </kbd>
          </button>
        </div>

        {/* Navigation list with high-contrast active styling in BOTH light & dark modes */}
        <nav className="flex-1 space-y-1.5 p-3 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              location.pathname === item.path ||
              location.pathname.startsWith(`${item.path}/`);

            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={handleClose}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3.5 py-3 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-accent text-white font-semibold shadow-md"
                    : "text-sidebar-icon hover:bg-white/10 hover:text-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn(isActive ? "text-white" : "text-sidebar-icon")}>
                    {item.icon}
                  </span>
                  <span className={cn(isActive ? "text-white font-semibold" : "text-sidebar-icon")}>
                    {item.title}
                  </span>
                </div>

                {item.badge !== undefined && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-sev-p1 px-1.5 text-xs font-bold text-white tabular-nums">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer info in drawer */}
        <div className="border-t border-white/10 p-4 text-xs text-sidebar-icon">
          <span className="font-semibold text-white/80">Resolver SRE</span> · v2.4.0
        </div>
      </aside>

      {/* ====================================================================
          DESKTOP FLOATING SIDEBAR (72px black pill, signature notch tab)
          ==================================================================== */}
      <aside
        className="hidden lg:flex lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:flex-col lg:justify-center lg:py-4 lg:pl-4 lg:pr-0 select-none z-30"
        aria-label="Primary Navigation"
      >
        {/* Floating rounded black pill container (72px wide) */}
        <div className="relative flex h-[calc(100vh-32px)] w-[72px] flex-col items-center rounded-sidebar bg-sidebar py-5">
          {/* Logo tile: 40px rounded violet square with bold white "R" */}
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white font-bold text-lg shadow-sm"
            title={organization ? `${organization.name} (${organization.slug})` : "Resolver"}
          >
            R
          </div>

          {/* Navigation rail */}
          <nav className="mt-8 flex flex-1 flex-col items-center w-full gap-3">
            {navItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                location.pathname.startsWith(`${item.path}/`);

              if (isActive) {
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    title={item.title}
                    aria-label={item.title}
                    className={cn(
                      "relative flex h-14 w-full items-center justify-start",
                      item.path === "/settings" && "mt-auto"
                    )}
                  >
                    {/* The signature notch tab SVG extending seamlessly into the page */}
                    <NotchTabSvg isDark={isDark} />

                    {/*
                      Active icon:
                      - Light theme: dark ink (#111113) on warm grey (#ECECE8)
                      - Dark theme: crisp white (#FFFFFF) on dark page (#0E0E10)
                    */}
                    <span
                      className={cn(
                        "relative z-10 flex h-14 w-[72px] items-center justify-center transition-transform hover:scale-105",
                        isDark ? "text-white" : "text-ink"
                      )}
                      style={{ color: isDark ? "#FFFFFF" : "#111113" }}
                    >
                      {item.icon}
                    </span>

                    {/* Badge */}
                    {item.badge !== undefined && (
                      <span className="absolute left-11 top-2 z-20 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sev-p1 px-1 text-[10px] font-bold text-white tabular-nums shadow-sm">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              }

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={item.title}
                  aria-label={item.title}
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-full text-sidebar-icon transition-all duration-150 hover:bg-white/10 hover:text-white",
                    item.path === "/settings" && "mt-auto"
                  )}
                >
                  {item.icon}

                  {item.badge !== undefined && (
                    <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sev-p1 px-1 text-[10px] font-bold text-white tabular-nums shadow-sm">
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
