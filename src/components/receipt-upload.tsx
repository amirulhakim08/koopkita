"use client";
import * as React from "react";
import { CheckCircle2, FileUp, Loader2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateUpload } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useFieldError } from "@/components/action-form";

/**
 * Uploads directly to a private Supabase Storage bucket under <userId>/<uuid>.<ext>.
 * Storage RLS only allows writes into the user's own folder; the bucket also
 * enforces size and MIME type. The server action receives only the object path.
 */
export function ReceiptUpload({
  userId, name = "receipt_path", bucket = "receipts", label = "Resit pembayaran", required = true,
}: { userId: string; name?: string; bucket?: "receipts" | "payout-proofs"; label?: string; required?: boolean }) {
  const [path, setPath] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "uploading" | "done" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const fieldError = useFieldError(name);
  const inputId = React.useId();

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const invalid = validateUpload(file);
    if (invalid) {
      setError(invalid);
      setStatus("error");
      e.target.value = "";
      return;
    }
    setError(null);
    setStatus("uploading");
    setFileName(file.name);
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[file.type] ?? "bin";
    const objectPath = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await createClient().storage.from(bucket).upload(objectPath, file, {
      contentType: file.type, upsert: false, cacheControl: "0",
    });
    if (upErr) {
      setError("Muat naik gagal. Sila cuba lagi.");
      setStatus("error");
      return;
    }
    setPath(objectPath);
    setStatus("done");
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      <input type="hidden" name={name} value={path} />
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-3 text-sm transition-colors hover:bg-muted",
          status === "done" && "border-success/40 bg-success-soft",
          (status === "error" || fieldError) && "border-danger/50",
        )}
      >
        {status === "uploading" ? (
          <Loader2 className="size-5 animate-spin text-primary" />
        ) : status === "done" ? (
          <CheckCircle2 className="size-5 text-success" />
        ) : status === "error" ? (
          <X className="size-5 text-danger" />
        ) : (
          <FileUp className="size-5 text-primary" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {status === "done" ? fileName : status === "uploading" ? "Memuat naik…" : "Pilih fail (JPG, PNG, WEBP atau PDF, maks 5MB)"}
        </span>
      </label>
      <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" onChange={onChange} />
      {(error || fieldError?.[0]) && <p className="text-xs font-medium text-danger">{error ?? fieldError?.[0]}</p>}
    </div>
  );
}
