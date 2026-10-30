import React from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

export interface AppLayoutProps {
  unreadNotificationCount?: number;
}

export const AppLayout: React.FC<AppLayoutProps> = ({ unreadNotificationCount = 0 }) => {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Sidebar */}
      <Sidebar unreadNotificationCount={unreadNotificationCount} />

      {/* Main Content Column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header unreadCount={unreadNotificationCount} />

        {/* Page Content Body */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

