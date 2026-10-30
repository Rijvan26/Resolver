import React from "react";
import { useParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const IncidentDetailsPage: React.FC = () => {
  const { incidentId } = useParams<{ incidentId: string }>();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
        Incident Details
      </h1>
      <Card>
        <CardHeader>
          <CardTitle>Incident #{incidentId}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-slate-500 py-6 text-center">
            Incident Details, Comments & Activity Timeline (Phase 4 & 5)
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default IncidentDetailsPage;

