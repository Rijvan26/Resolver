import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { LayoutDashboard } from "lucide-react";

export const DashboardPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Incident Operations Dashboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time incident metrics, team workload, and activity feed
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <CardTitle>Overview Metrics</CardTitle>
          </div>
          <CardDescription>Visualizations and charts will be implemented in Phase 3</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Dashboard Module (Phase 3)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;

