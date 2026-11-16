"use client";
import * as React from "react";
import { Label } from "@/components/ui/input";
import { useFieldError } from "@/components/action-form";

/** Label + control + error. Errors come from the enclosing ActionForm (field name = htmlFor or `name`). */
export function FormField({
  label, htmlFor, name, error, hint, children, required, className,
}: { label: string; htmlFor: string; name?: string; error?: string[]; hint?: string; children: React.ReactNode; required?: boolean; className?: string }) {
  const ctxError = useFieldError(name ?? htmlFor);
  const err = error ?? ctxError;
  return (
    <div className={className ?? "space-y-1.5"}>
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </Label>
      {children}
      {hint && !err?.length && <p className="text-xs text-muted-foreground">{hint}</p>}
      {err?.length ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger">
          {err[0]}
        </p>
      ) : null}
    </div>
  );
}
