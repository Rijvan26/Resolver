import React from "react";
import { cn } from "@/lib/utils";
import { FolderOpen } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-slate-800",
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-muted-fg">
        {icon || <FolderOpen className="h-6 w-6" />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-main-fg">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-xs text-muted-fg">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
};

