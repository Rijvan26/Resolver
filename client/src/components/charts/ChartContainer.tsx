import React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ChartSkeleton } from "./ChartSkeleton";
import { ChartEmptyState } from "./ChartEmptyState";
import { AlertCircle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ChartContainerProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
  height?: number | string;
  className?: string;
  children: React.ReactNode;
}

export const ChartContainer: React.FC<ChartContainerProps> = ({
  title,
  description,
  icon,
  action,
  isLoading = false,
  isError = false,
  isEmpty = false,
  emptyMessage = "No chart data available for this range.",
  errorMessage = "Failed to load chart metrics.",
  onRetry,
  height = 280,
  className,
  children,
}) => {
  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <div className="h-5 w-44 bg-pill rounded animate-pulse" />
          {description && <div className="h-4 w-60 bg-pill rounded animate-pulse mt-1" />}
        </CardHeader>
        <CardContent>
          <ChartSkeleton height={typeof height === "number" ? height : 280} />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className={`border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20 ${className || ""}`}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        <CardContent className="h-64 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="h-6 w-6 text-sev-p1" />
          <p className="text-xs text-sev-p1">{errorMessage}</p>
          {onRetry && (
            <Button size="sm" variant="outline" onClick={onRetry} leftIcon={<RotateCw className="h-3.5 w-3.5" />}>
              Retry
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle>{title}</CardTitle>
            </div>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {action}
        </div>
      </CardHeader>

      <CardContent>
        {isEmpty ? (
          <ChartEmptyState message={emptyMessage} height={typeof height === "number" ? height : 240} />
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
};

export default ChartContainer;

