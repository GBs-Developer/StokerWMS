import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface GradientHeaderProps {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}

export function GradientHeader({ title, subtitle, children, className, compact = false }: GradientHeaderProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        "bg-gradient-to-br from-[hsl(222,47%,14%)] via-[hsl(217,60%,28%)] to-[hsl(199,89%,30%)]",
        compact ? "px-4 py-4 md:px-6 md:py-5" : "px-4 py-5 md:px-6 md:py-7",
        "text-white",
        className
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,179,237,0.15),_transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(56,178,172,0.1),_transparent_50%)]" />

      <div className="relative max-w-7xl mx-auto">
        {title ? (
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 min-w-0 overflow-hidden">
            <div className="min-w-0">
              <h1 className={cn(
                "font-bold tracking-tight truncate",
                compact ? "text-xl md:text-2xl" : "text-2xl md:text-3xl"
              )}>
                {title}
              </h1>
              {subtitle && (
                <p className="text-white/70 mt-0.5 text-sm truncate">{subtitle}</p>
              )}
            </div>
            {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
