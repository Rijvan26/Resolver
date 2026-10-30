import React from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

export const Spinner: React.FC<SpinnerProps> = ({ className, size = "md" }) => {
  const sizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  return <Loader2 className={cn("animate-spin text-brand-600 dark:text-brand-400", sizes[size], className)} />;
};

