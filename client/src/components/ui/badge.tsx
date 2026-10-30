import React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "secondary" | "success" | "warning" | "danger" | "info" | "outline";
  size?: "sm" | "md";
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = "default",
  size = "sm",
  dot = false,
  children,
  ...props
}) => {
  const baseStyles = "inline-flex items-center font-medium rounded-full select-none";

  const variants = {
    default: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
    secondary: "bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
    success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40",
    warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/40",
    danger: "bg-rose-50 text-rose-700 dark:bg-rose-950/70 dark:text-rose-300 border border-rose-200/60 dark:border-rose-800/40",
    info: "bg-sky-50 text-sky-700 dark:bg-sky-950/70 dark:text-sky-300 border border-sky-200/60 dark:border-sky-800/40",
    outline: "border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300",
  };

  const sizes = {
    sm: "px-2 py-0.5 text-xs gap-1.5",
    md: "px-2.5 py-1 text-xs gap-2",
  };

  const dotColors = {
    default: "bg-slate-400",
    secondary: "bg-brand-500",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-sky-500",
    outline: "bg-slate-400",
  };

  return (
    <span className={cn(baseStyles, variants[variant], sizes[size], className)} {...props}>
      {dot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dotColors[variant])} />}
      {children}
    </span>
  );
};

