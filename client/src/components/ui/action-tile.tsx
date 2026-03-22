import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Link } from "wouter";

interface ActionTileProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  badge?: string | number;
  disabled?: boolean;
  className?: string;
}

export function ActionTile({
  icon: Icon,
  title,
  description,
  href,
  badge,
  disabled = false,
  className,
}: ActionTileProps) {
  const content = (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center p-6 bg-white dark:bg-card rounded-2xl shadow-sm border border-border/50",
        "transition-all duration-200",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover-elevate cursor-pointer hover:shadow-md hover:border-primary/30",
        className
      )}
    >
      {badge !== undefined && (
        <span className="absolute -top-2 -right-2 min-w-[1.5rem] h-6 flex items-center justify-center px-2 bg-primary text-primary-foreground text-xs font-bold rounded-full">
          {badge}
        </span>
      )}
      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <h3 className="font-semibold text-foreground text-center">{title}</h3>
      <p className="text-xs text-muted-foreground text-center mt-1">{description}</p>
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href} data-testid={`tile-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      {content}
    </Link>
  );
}
