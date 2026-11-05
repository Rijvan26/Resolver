/** ChartSkeleton — pulse placeholder while chart data loads */
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export const ChartSkeleton: React.FC<{ height?: number }> = ({ height = 280 }) => (
  <div className="flex flex-col gap-3 p-1" style={{ height }}>
    <div className="flex justify-between">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-20" />
    </div>
    <Skeleton className="flex-1 w-full rounded-xl" />
    <div className="flex gap-4">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-16" />
    </div>
  </div>
);

export default ChartSkeleton;

