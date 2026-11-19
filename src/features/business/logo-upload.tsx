"use client";
import * as React from "react";
import { ImageUp, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { logoUrl } from "@/lib/storage-url";

/** Uploads a PNG/JPG logo (≤1MB) to the public "business-logos" bucket under <userId>/. */
export function LogoUpload({ userId, currentPath, name = "logo_path", label = "Logo" }: { userId: string; currentPath: string | null; name?: string; label?: string }) {
  const [path, setPath] = React.useState(currentPath ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const id = React.useId();
  const src = logoUrl(path);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg"].includes(file.type)) return setError("Hanya fail PNG atau JPG.");
    if (file.size > 1024 * 1024) return setError("Saiz maksimum logo ialah 1MB.");
    setError(null);
    setBusy(true);
    const objectPath = `${userId}/logo-${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
    const { error: upErr } = await createClient().storage.from("business-logos").upload(objectPath, file, { contentType: file.type, upsert: false });
    setBusy(false);
    if (upErr) return setError("Muat naik gagal. Sila cuba lagi.");
    setPath(objectPath);
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <input type="hidden" name={name} value={path} />
      <div className="flex items-center gap-4">
        <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {src ? <img src={src} alt="Logo" className="size-full object-contain" /> : <ImageUp className="size-6 text-muted-foreground" />}
        </div>
        <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-input bg-white px-3 py-2 text-sm font-medium hover:bg-muted">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {src ? "Tukar logo" : "Muat naik logo"}
        </label>
        <input id={id} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={onChange} />
      </div>
      <p className="text-xs text-muted-foreground">PNG atau JPG, maksimum 1MB. Dipaparkan pada invois dan resit.</p>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
