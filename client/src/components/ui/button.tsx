import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
  size?: "sm" | "md" | "lg" | "icon";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-lg";

    const variants = {
      primary:
        "bg-brand-600 hover:bg-brand-700 text-white shadow-sm focus:ring-brand-500 active:bg-brand-800 dark:bg-brand-500 dark:hover:bg-brand-600",
      secondary:
        "bg-slate-100 hover:bg-slate-200 text-slate-800 shadow-sm focus:ring-slate-400 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100",
      outline:
        "border border-slate-300 hover:bg-slate-100 text-slate-700 focus:ring-brand-500 active:bg-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
      ghost:
        "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400 active:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      danger:
        "bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500 active:bg-red-800 dark:bg-red-600 dark:hover:bg-red-700",
      link:
        "text-brand-600 hover:text-brand-700 underline-offset-4 hover:underline p-0 focus:ring-brand-500 dark:text-brand-400",
    };

    const sizes = {
      sm: "text-xs px-2.5 py-1.5 gap-1.5",
      md: "text-sm px-3.5 py-2 gap-2",
      lg: "text-base px-5 py-2.5 gap-2.5",
      icon: "p-2 w-9 h-9 justify-center",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          leftIcon && <span className="shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </button>
    );
  }
);

Button.displayName = "Button";

