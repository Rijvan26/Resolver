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
      "inline-flex items-center justify-center font-medium tracking-tight transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:opacity-50 disabled:pointer-events-none select-none rounded-pill active:scale-[0.99]";

    const variants = {
      primary:
        "bg-ink hover:opacity-85 text-page focus-visible:ring-brand-500 active:opacity-75",
      secondary:
        "bg-slate-100 hover:bg-slate-200 text-slate-800 shadow-xs focus-visible:ring-slate-400 active:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100",
      outline:
        "border border-slate-300/90 hover:bg-slate-100 text-slate-700 focus-visible:ring-brand-500 active:bg-slate-200 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800/80",
      ghost:
        "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 focus-visible:ring-slate-400 active:bg-slate-200 dark:text-muted-fg dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
      danger:
        "bg-sev-p1 hover:opacity-90 text-white focus-visible:ring-sev-p1 active:opacity-80",
      link:
        "text-brand-600 hover:text-brand-700 underline-offset-4 hover:underline p-0 focus-visible:ring-brand-500 dark:text-brand-400",
    };

    const sizes = {
      sm: "text-xs px-3 h-8 gap-1.5",
      md: "text-sm px-3.5 h-9 gap-2",
      lg: "text-base px-5 h-11 gap-2.5",
      icon: "h-9 w-9 p-0 justify-center",
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

