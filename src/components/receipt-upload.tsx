"use client";
import * as React from "react";
import { CheckCircle2, FileUp, Loader2, ScanText, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validateUpload } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useFieldError } from "@/components/action-form";

/**
 * Uploads directly to a private Supabase Storage bucket under <userId>/<uuid>.<ext>.
 * Storage RLS only allows writes into the user's own folder; the bucket also
 * enforces size and MIME type. The server action receives only the object path.
 */
type Autofill = { amount?: string; date?: string; reference?: string };

/** Set an input's value so both plain and React-controlled inputs pick it up. */
function setFieldValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Only fill a field the user has not typed into (empty, or still showing its default). */
function untouched(input: HTMLInputElement) {
  return input.value === "" || input.value === input.defaultValue;
}

export function ReceiptUpload({
  userId, name = "receipt_path", bucket = "receipts", label = "Resit pembayaran", required = true, autofill,
}: { userId: string; name?: string; bucket?: "receipts" | "payout-proofs" | "business-proofs"; label?: string; required?: boolean; autofill?: Autofill }) {
  const [ocr, setOcr] = React.useState<{ state: "reading" | "done" | "none"; filled?: string[] } | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);

  async function readReceipt(file: File) {
    if (!autofill) return;
    setOcr({ state: "reading" });
    try {
      const [{ extractReceiptText }, { parseReceipt }] = await Promise.all([import("@/lib/ocr/extract"), import("@/lib/ocr/parse-receipt")]);
      const fields = parseReceipt(await extractReceiptText(file));
      const form = rootRef.current?.closest("form");
      const filled: string[] = [];
      const fill = (field: string | undefined, value: string | undefined, label: string) => {
        if (!field || !value || !form) return;
        const input = form.querySelector<HTMLInputElement>(`input[name="${field}"]`);
        if (input && untouched(input)) {
          setFieldValue(input, value);
          filled.push(label);
        }
      };
      fill(autofill.amount, fields.amountSen ? (fields.amountSen / 100).toFixed(2) : undefined, "jumlah");
      fill(autofill.date, fields.date, "tarikh");
      fill(autofill.reference, fields.reference, "rujukan");
      setOcr(filled.length ? { state: "done", filled } : { state: "none" });
    } catch {
      setOcr({ state: "none" });
    }
  }
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
    void readReceipt(file); // runs in the browser while the file uploads
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
    <div ref={rootRef} className="space-y-1.5">
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
      {autofill && ocr && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
          {ocr.state === "reading" ? <Loader2 className="size-3.5 animate-spin" /> : <ScanText className="size-3.5" />}
          {ocr.state === "reading" && "Membaca resit…"}
          {ocr.state === "done" && <span><strong className="text-success">Diisi automatik daripada resit:</strong> {ocr.filled!.join(", ")}. Sila semak sebelum hantar.</span>}
          {ocr.state === "none" && "Resit tidak dapat dibaca secara automatik — sila isi secara manual."}
        </p>
      )}
      {autofill && !ocr && <p className="text-xs text-muted-foreground">Jumlah, tarikh dan rujukan akan diisi automatik daripada resit (dibaca dalam peranti anda).</p>}
    </div>
  );
}
