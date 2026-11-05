import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { CommandPalette } from "@/components/shared/CommandPalette";

export interface AppLayoutProps {
  unreadNotificationCount?: number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ unreadNotificationCount = 0 }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-page">
      {/* Global Command Palette (Ctrl+K) */}
      <CommandPalette />

      {/* Sidebar */}
      <Sidebar unreadNotificationCount={unreadNotificationCount} />

      {/* Main Content Column */}
      <div className="flex flex-1 flex-col min-w-0 max-w-full overflow-hidden w-full">
        {/* Top Header */}
        <Header unreadCount={unreadNotificationCount} />

        {/* Page Content Body */}
        <main className="flex-1 min-w-0 max-w-full overflow-y-auto overflow-x-hidden p-3 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl w-full min-w-0">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;
