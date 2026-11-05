import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import { setCommandPaletteOpen, setTheme } from "@/app/uiSlice";
import {
  LayoutGrid,
  AlertTriangle,
  Users,
  Bell,
  Settings,
  Plus,
  Sun,
  Moon,
  Search,
  ArrowRight,
  Flame,
  Activity,
  Layers,
  X,
} from "lucide-react";

export const CommandPalette: React.FC = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const isOpen = useAppSelector((state) => state.ui.commandPaletteOpen);
  const theme = useAppSelector((state) => state.ui.theme);
  const [search, setSearch] = useState("");

  // Global keyboard shortcut: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        dispatch(setCommandPaletteOpen(!isOpen));
      } else if (e.key === "Escape" && isOpen) {
        dispatch(setCommandPaletteOpen(false));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dispatch, isOpen]);

  // Reset search input whenever opened
  useEffect(() => {
    if (isOpen) {
      setSearch("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleClose = () => {
    dispatch(setCommandPaletteOpen(false));
  };

  const handleNavigate = (path: string) => {
    handleClose();
    navigate(path);
  };

  const handleToggleTheme = () => {
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    dispatch(setTheme(isDark ? "light" : "dark"));
    handleClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-3 sm:pt-20 px-3 sm:px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Command Palette Modal */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border-color bg-card-bg shadow-2xl transition-all z-10 animate-in fade-in zoom-in-95 duration-150">
        <Command
          label="Global Command Menu"
          shouldFilter={true}
          className="flex flex-col w-full focus:outline-none"
        >
          {/* Header Search Input */}
          <div className="flex items-center gap-3 border-b border-border-color px-4 py-3.5">
            <Search className="h-4 w-4 shrink-0 text-muted-fg" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search incidents, services, or run commands..."
              className="flex-1 bg-transparent text-sm text-main-fg placeholder:text-muted-fg focus:outline-none"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-muted-fg hover:text-main-fg"
                title="Clear input"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="rounded bg-pill px-1.5 py-0.5 text-[10px] font-semibold text-muted-fg border border-border-color">
              ESC
            </kbd>
          </div>

          {/* List of items */}
          <Command.List className="max-h-80 overflow-y-auto p-2 scrollbar-none">
            <Command.Empty className="py-8 text-center text-xs text-muted-fg">
              No results found for &ldquo;<span className="font-semibold text-main-fg">{search}</span>&rdquo;
            </Command.Empty>

            {/* Quick Actions */}
            <Command.Group
              heading="Quick Actions"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-fg"
            >
              <Command.Item
                onSelect={() => handleNavigate("/incidents/new")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-sev-p1 text-white">
                    <Plus className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-semibold text-sev-p1">Declare New Incident</span>
                </div>
                <span className="text-[10px] text-muted-fg">Action</span>
              </Command.Item>

              <Command.Item
                onSelect={handleToggleTheme}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-pill text-main-fg">
                    {theme === "dark" ? (
                      <Sun className="h-3.5 w-3.5 text-sev-p3" />
                    ) : (
                      <Moon className="h-3.5 w-3.5 text-main-fg" />
                    )}
                  </div>
                  <span>Toggle Light/Dark Theme</span>
                </div>
                <span className="text-[10px] text-muted-fg">Current: {theme}</span>
              </Command.Item>
            </Command.Group>

            {/* Navigation */}
            <Command.Group
              heading="Navigation"
              className="mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-fg"
            >
              <Command.Item
                onSelect={() => handleNavigate("/dashboard")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <LayoutGrid className="h-4 w-4 text-muted-fg" />
                  <span>Dashboard Overview</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-fg" />
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/incidents")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-4 w-4 text-muted-fg" />
                  <span>Incidents Tracker</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-fg" />
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/members")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="h-4 w-4 text-muted-fg" />
                  <span>Team Workload & Members</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-fg" />
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/notifications")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-muted-fg" />
                  <span>Notifications & Audit Log</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-fg" />
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/settings")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="h-4 w-4 text-muted-fg" />
                  <span>Settings & Preferences</span>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-fg" />
              </Command.Item>
            </Command.Group>

            {/* Common Incident Jump Links */}
            <Command.Group
              heading="Active Incidents"
              className="mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-fg"
            >
              <Command.Item
                onSelect={() => handleNavigate("/incidents")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Flame className="h-3.5 w-3.5 text-sev-p1" />
                  <div>
                    <span className="font-semibold text-main-fg">Payment API latency spike</span>
                    <span className="ml-2 text-[10px] text-muted-fg">payments-api · P1</span>
                  </div>
                </div>
                <span className="rounded-full bg-sev-p1-subtle px-2 py-0.5 text-[10px] font-semibold text-sev-p1">
                  P1 Critical
                </span>
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/incidents")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Activity className="h-3.5 w-3.5 text-sev-p2" />
                  <div>
                    <span className="font-semibold text-main-fg">Database connection pool exhausted</span>
                    <span className="ml-2 text-[10px] text-muted-fg">orders-db · P2</span>
                  </div>
                </div>
                <span className="rounded-full bg-sev-p2-subtle px-2 py-0.5 text-[10px] font-semibold text-sev-p2">
                  P2 High
                </span>
              </Command.Item>

              <Command.Item
                onSelect={() => handleNavigate("/incidents")}
                className="flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium text-main-fg hover:bg-pill-hover cursor-pointer aria-selected:bg-pill-hover transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <Layers className="h-3.5 w-3.5 text-sev-p3" />
                  <div>
                    <span className="font-semibold text-main-fg">Elevated 5xx on search service</span>
                    <span className="ml-2 text-[10px] text-muted-fg">search · P3</span>
                  </div>
                </div>
                <span className="rounded-full bg-sev-p3-subtle px-2 py-0.5 text-[10px] font-semibold text-sev-p3">
                  P3 Medium
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>

          {/* Footer keyboard hints */}
          <div className="flex items-center justify-between border-t border-border-color bg-pill px-4 py-2 text-[11px] text-muted-fg">
            <div className="flex items-center gap-2">
              <span>Use</span>
              <kbd className="rounded bg-card-bg px-1.5 py-0.5 font-mono text-[10px] shadow-xs">↑</kbd>
              <kbd className="rounded bg-card-bg px-1.5 py-0.5 font-mono text-[10px] shadow-xs">↓</kbd>
              <span>to navigate</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>Press</span>
              <kbd className="rounded bg-card-bg px-1.5 py-0.5 font-mono text-[10px] shadow-xs">Enter</kbd>
              <span>to select</span>
            </div>
          </div>
        </Command>
      </div>
    </div>
  );
};

export default CommandPalette;

