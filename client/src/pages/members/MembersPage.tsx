import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Users } from "lucide-react";

export const MembersPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Team Members & Access
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Manage organization members, invitations, and role-based access control
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-brand-600 dark:text-brand-400" />
            <CardTitle>Organization Members</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Organization Management & Invitations (Phase 6)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MembersPage;

