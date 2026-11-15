import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label, value, hint, icon: Icon, emphasis = false,
}: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; emphasis?: boolean }) {
  return (
    <Card className={cn("p-4 sm:p-5", emphasis && "border-primary/20 bg-primary text-primary-foreground")}>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("text-xs font-medium uppercase tracking-wide", emphasis ? "text-primary-foreground/75" : "text-muted-foreground")}>{label}</p>
        {Icon && (
          <span className={cn("rounded-lg p-2", emphasis ? "bg-white/10" : "bg-secondary text-primary")}>
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums sm:text-2xl">{value}</p>
      {hint && <p className={cn("mt-1 text-xs", emphasis ? "text-primary-foreground/75" : "text-muted-foreground")}>{hint}</p>}
    </Card>
  );
}
