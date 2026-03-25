import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GradientHeaderProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
}

export function GradientHeader({ title, subtitle, children, className }: GradientHeaderProps) {
  return (
    <div
      className={cn(
        "bg-gradient-to-r from-[hsl(213,67%,25%)] via-[hsl(207,62%,38%)] to-[hsl(157,50%,30%)]",
        "px-4 py-6 md:px-6 md:py-8 text-white",
        className
      )}
    >
      <div className="max-w-7xl mx-auto">
        {title ? (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 min-w-0 overflow-hidden">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">{title}</h1>
              {subtitle && (
                <p className="text-white/80 mt-1 text-sm md:text-base truncate">{subtitle}</p>
              )}
            </div>
            {children && <div className="flex items-center gap-3 shrink-0">{children}</div>}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
