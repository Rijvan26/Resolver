import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-main-fg"
          >
            {label}
          </label>
        )}
        <div className="relative rounded-lg">
          {leftIcon && (
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-muted-fg">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/25 dark:disabled:bg-slate-800",
              leftIcon && "pl-9",
              rightIcon && "pr-9",
              error && "border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500",
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-fg">
              {rightIcon}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {!error && helperText && (
          <p className="text-xs text-muted-fg">{helperText}</p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

