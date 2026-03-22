
import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PickingLayoutProps {
    children: ReactNode;
    className?: string;
}

export function PickingLayout({ children, className }: PickingLayoutProps) {
    return (
        <div className={cn("flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden", className)}>
            {/* 
        This layout is designed for full-screen handheld usage.
        It intentionally omits sidebars and headers to maximize space.
      */}
            <main className="flex-1 overflow-y-auto p-4 flex flex-col relative">
                {children}
            </main>
        </div>
    );
}
