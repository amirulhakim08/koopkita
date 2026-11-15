import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/labels";

const styles: Record<Tone, string> = {
  neutral: "bg-muted border-border",
  info: "bg-info-soft border-info/20 text-info",
  success: "bg-success-soft border-success/20 text-success",
  warning: "bg-warning-soft border-warning/20 text-warning",
  danger: "bg-danger-soft border-danger/20 text-danger",
};
const icons = { neutral: Info, info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle };

export function Alert({ tone = "info", title, children, className }: { tone?: Tone; title?: string; children?: React.ReactNode; className?: string }) {
  const Icon = icons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-xl border p-4 text-sm", styles[tone], className)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
    </div>
  );
}
