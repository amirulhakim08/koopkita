"use client";
import * as React from "react";
import { Check, Copy, Download, Loader2, Mail, MessageCircle, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

/** Malaysian mobile number -> wa.me format (60XXXXXXXXX). */
function waNumber(phone?: string | null): string {
  if (!phone) return "";
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return `6${d}`;
  return d;
}

/**
 * Share an invoice / receipt as a PDF file.
 *  - "Kongsi PDF" and "WhatsApp" both build the PDF and open the device share
 *    sheet with the file attached; for WhatsApp the member then picks WhatsApp
 *    (a web page cannot send a file straight into WhatsApp).
 *  - "Sertakan pautan" adds the customer link to the message; off by default
 *    because the PDF itself is attached.
 *  - Where the browser cannot share files (e.g. desktop Chrome on Linux,
 *    Firefox), "Kongsi PDF" offers download / e-mail / WhatsApp / copy link, and
 *    "WhatsApp" downloads the PDF and opens WhatsApp with the message so the
 *    PDF can be attached there.
 *  - The PDF is prefetched in the background so the share sheet can open within
 *    the tap (iOS requires the share call to follow the user's gesture closely).
 */
export function ShareDocument({
  pdfUrl, fileName, title, message, publicPath, phone, compact = false,
}: {
  pdfUrl: string; fileName: string; title: string; message: string; publicPath?: string | null; phone?: string | null; compact?: boolean;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState<"share" | "whatsapp" | null>(null);
  const [fallback, setFallback] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [includeLink, setIncludeLink] = React.useState(false);
  const checkboxId = React.useId();
  // window origin on the client, "" during server rendering
  const origin = React.useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const fetching = React.useRef<Promise<File> | null>(null);

  const link = publicPath && origin ? `${origin}${publicPath}` : "";
  const fullMessage = includeLink && link ? `${message}\n${link}` : message;

  const getFile = React.useCallback(() => {
    if (file) return Promise.resolve(file);
    if (!fetching.current) {
      fetching.current = fetch(pdfUrl, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("pdf");
          return r.blob();
        })
        .then((b) => {
          const f = new File([b], fileName, { type: "application/pdf" });
          setFile(f);
          return f;
        })
        .finally(() => {
          fetching.current = null;
        });
    }
    return fetching.current;
  }, [file, pdfUrl, fileName]);

  // prefetch shortly after mount so the share sheet opens instantly on tap
  React.useEffect(() => {
    const t = setTimeout(() => void getFile().catch(() => {}), 600);
    return () => clearTimeout(t);
  }, [getFile]);

  const waHref = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(fullMessage)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(fullMessage)}`;

  async function download() {
    try {
      const f = await getFile();
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    } catch {
      toast.error("PDF tidak dapat dimuat turun.");
      return false;
    }
  }

  /** Opens the share sheet with the PDF. Returns false when the browser cannot share files. */
  async function shareFile(): Promise<boolean> {
    const f = await getFile();
    const data: ShareData = { files: [f], title, text: fullMessage };
    if (typeof navigator === "undefined" || !navigator.canShare?.(data)) return false;
    try {
      await navigator.share(data);
    } catch (e) {
      const name = (e as Error).name;
      if (name === "NotAllowedError") toast.info("PDF sudah sedia — tekan sekali lagi.");
      else if (name !== "AbortError") return false;
    }
    return true;
  }

  async function onShare() {
    setBusy("share");
    try {
      if (!(await shareFile())) setFallback(true);
    } catch {
      toast.error("PDF tidak dapat dijana. Sila cuba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function onWhatsApp() {
    setBusy("whatsapp");
    let shared = false;
    try {
      shared = await shareFile();
    } catch {
      toast.error("PDF tidak dapat dijana. Sila cuba lagi.");
      setBusy(null);
      return;
    }
    if (!shared) {
      // no file sharing here: download the PDF and open WhatsApp with the message
      if (await download()) {
        window.open(waHref, "_blank", "noopener,noreferrer");
        toast.info("PDF dimuat turun. Lampirkan PDF itu dalam WhatsApp.");
      }
    }
    setBusy(null);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Pautan disalin.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Pautan tidak dapat disalin.");
    }
  }

  const size = compact ? "sm" : "default";
  return (
    <div className="space-y-2">
      <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"}>
        <Button type="button" onClick={onShare} disabled={busy !== null} size={size} className="col-span-2 sm:col-span-1">
          {busy === "share" ? <Loader2 className="animate-spin" /> : <Share2 />} Kongsi PDF
        </Button>
        <Button type="button" variant="outline" size={size} onClick={onWhatsApp} disabled={busy !== null} className="border-[#25d366]/40 text-[#128c4a]">
          {busy === "whatsapp" ? <Loader2 className="animate-spin" /> : <MessageCircle />} WhatsApp
        </Button>
        <Button type="button" variant="outline" size={size} onClick={() => void download()}><Download /> PDF</Button>
        {link && (
          <Button type="button" variant="outline" size={size} onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Disalin" : "Salin pautan"}
          </Button>
        )}
      </div>
      {link && (
        <label htmlFor={checkboxId} className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <input id={checkboxId} type="checkbox" checked={includeLink} onChange={(e) => setIncludeLink(e.target.checked)} className="size-4 accent-[var(--primary)]" />
          Sertakan pautan dalam mesej
        </label>
      )}

      {fallback && (
        <div role="dialog" aria-label="Pilihan kongsi" className="rounded-xl border bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Kongsi melalui</p>
            <button type="button" onClick={() => setFallback(false)} aria-label="Tutup" className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Pelayar ini tidak menyokong menu kongsi fail. Muat turun PDF dan lampirkan, atau hantar pautan.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={() => void download()}><Download /> Muat turun PDF</Button>
            <Button asChild variant="outline"><a href={mailHref}><Mail /> E-mel</a></Button>
            <Button asChild variant="outline"><a href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp (mesej)</a></Button>
            {link && <Button type="button" variant="outline" onClick={copy}><Copy /> Salin pautan</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
