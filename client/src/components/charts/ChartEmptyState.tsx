import React from "react";
import { BarChart3 } from "lucide-react";

export interface ChartEmptyStateProps {
  message?: string;
  height?: number | string;
}

export const ChartEmptyState: React.FC<ChartEmptyStateProps> = ({
  message = "No data points recorded for this selection.",
  height = 240,
}) => (
  <div
    className="flex flex-col items-center justify-center gap-2 text-center text-muted-fg"
    style={{ height: typeof height === "number" ? `${height}px` : height }}
  >
    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pill text-muted-fg">
      <BarChart3 className="h-5 w-5 opacity-50" />
    </div>
    <p className="text-xs max-w-xs">{message}</p>
  </div>
);

export default ChartEmptyState;

