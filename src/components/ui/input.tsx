import * as React from "react";
import { cn } from "@/lib/utils";

const field =
  "w-full rounded-lg border border-input bg-white px-3 text-sm shadow-xs transition-colors placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(field, "h-10", className)} {...props} />;
}
export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(field, "min-h-20 py-2", className)} {...props} />;
}
export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(field, "h-10 pr-8", className)} {...props} />;
}
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium leading-none", className)} {...props} />;
}
