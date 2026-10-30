import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Bell } from "lucide-react";

export const NotificationsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Notifications
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            System and incident updates relevant to your account
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <CardTitle>In-App Notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Notifications Feed (Phase 5)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default NotificationsPage;

