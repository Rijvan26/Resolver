import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export const SettingsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Configure organization settings, profile, and preferences
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <CardTitle>Organization & Profile Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Settings Module (Phase 6 & 7)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SettingsPage;

