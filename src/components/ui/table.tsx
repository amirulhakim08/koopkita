import * as React from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border bg-white">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}
export const THead = (p: React.ComponentProps<"thead">) => <thead className="bg-muted/60 text-left" {...p} />;
export const TBody = (p: React.ComponentProps<"tbody">) => <tbody className="divide-y" {...p} />;
export const TR = ({ className, ...p }: React.ComponentProps<"tr">) => <tr className={cn("hover:bg-muted/30", className)} {...p} />;
export const TH = ({ className, ...p }: React.ComponentProps<"th">) => (
  <th className={cn("whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground", className)} {...p} />
);
export const TD = ({ className, ...p }: React.ComponentProps<"td">) => <td className={cn("px-4 py-3 align-top", className)} {...p} />;
