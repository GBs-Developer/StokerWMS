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
        "relative overflow-hidden bg-sidebar text-sidebar-foreground",
        compact ? "px-4 py-3" : "px-4 py-4 md:px-6 md:py-5",
        className
      )}
      style={{
        background: "linear-gradient(135deg, hsl(var(--sidebar)) 0%, hsl(var(--sidebar-primary) / 0.25) 100%)",
      }}
    >
      {/* Accent overlays */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,179,237,0.12),_transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(56,178,172,0.07),_transparent_50%)] pointer-events-none" />
      {/* Top edge accent */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />

      <div className="relative max-w-7xl mx-auto">
        {title ? (
          <div className="flex items-center justify-between gap-3 min-w-0 overflow-hidden">
            <div className="min-w-0">
              <h1 className={cn(
                "font-bold tracking-tight truncate text-sidebar-foreground",
                compact ? "text-lg" : "text-xl md:text-2xl"
              )}>
                {title}
              </h1>
              {subtitle && (
                <p className="text-sidebar-foreground/50 text-xs truncate mt-0.5">{subtitle}</p>
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
