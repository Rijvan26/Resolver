import React from "react";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from "lucide-react";

export interface AlertProps {
  variant?: "info" | "success" | "warning" | "error";
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  onDismiss,
  className,
}) => {
  const variants = {
    info: {
      container: "bg-sky-50 text-sky-900 border-sky-200 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-800/40",
      icon: <Info className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />,
    },
    success: {
      container: "bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/40",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />,
    },
    warning: {
      container: "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800/40",
      icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />,
    },
    error: {
      container: "bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800/40",
      icon: <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />,
    },
  };

  const current = variants[variant];

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm transition-all",
        current.container,
        className
      )}
    >
      <div className="mt-0.5">{current.icon}</div>
      <div className="flex-1">
        {title && <h5 className="font-semibold leading-tight mb-1">{title}</h5>}
        <div className="text-xs leading-relaxed opacity-95">{children}</div>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

