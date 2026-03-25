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
  color?: string;
}

export function ActionTile({
  icon: Icon,
  title,
  description,
  href,
  badge,
  disabled = false,
  className,
  color,
}: ActionTileProps) {
  const content = (
    <div
      className={cn(
        "group relative flex flex-col items-center justify-center p-4 md:p-5",
        "bg-white dark:bg-card rounded-2xl",
        "border border-border/40",
        "transition-all duration-200 ease-out",
        "min-h-[120px]",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5 active:translate-y-0 active:shadow-sm cursor-pointer",
        className
      )}
    >
      {badge !== undefined && (
        <span className="absolute -top-2 -right-2 min-w-[1.5rem] h-6 flex items-center justify-center px-2 bg-primary text-primary-foreground text-xs font-bold rounded-full shadow-sm">
          {badge}
        </span>
      )}
      <div className={cn(
        "w-12 h-12 rounded-xl flex items-center justify-center mb-2.5",
        "transition-transform duration-200 group-hover:scale-105",
        color || "bg-primary/10"
      )}>
        <Icon className={cn(
          "h-6 w-6",
          color ? "text-white" : "text-primary"
        )} />
      </div>
      <h3 className="font-semibold text-foreground text-center text-sm leading-tight">{title}</h3>
      <p className="text-[11px] text-muted-foreground text-center mt-1 leading-tight line-clamp-2">{description}</p>
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
