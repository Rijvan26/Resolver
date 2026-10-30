import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export const IncidentsListPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Incidents
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Track, assign, and manage organization incidents
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <CardTitle>Incidents List</CardTitle>
          </div>
          <CardDescription>Filter, search, and manage incidents</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Incident Management (Phase 4)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IncidentsListPage;

