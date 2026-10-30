import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const CreateIncidentPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Report New Incident
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Incident Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Create Incident Form (Phase 4)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateIncidentPage;

