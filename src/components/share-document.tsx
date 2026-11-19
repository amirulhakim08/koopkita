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
 *  - "Kongsi": builds the PDF and opens the device share sheet with the file
 *    attached (WhatsApp, e-mail, Telegram ...). Where the browser has no share
 *    sheet for files (e.g. Firefox, Linux), a fallback panel offers download,
 *    e-mail, WhatsApp and copy-link instead.
 *  - The PDF is prefetched in the background so the share sheet can open within
 *    the tap (iOS requires the share call to follow the user's gesture closely).
 */
export function ShareDocument({
  pdfUrl, fileName, title, message, publicPath, phone, compact = false,
}: {
  pdfUrl: string; fileName: string; title: string; message: string; publicPath?: string | null; phone?: string | null; compact?: boolean;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [fallback, setFallback] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  // window origin on the client, "" during server rendering
  const origin = React.useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  const fetching = React.useRef<Promise<File> | null>(null);

  const link = publicPath && origin ? `${origin}${publicPath}` : "";
  const fullMessage = link ? `${message}\n${link}` : message;

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

  async function onShare() {
    setBusy(true);
    try {
      const f = await getFile();
      const data: ShareData = { files: [f], title, text: fullMessage };
      if (typeof navigator !== "undefined" && navigator.canShare?.(data)) {
        try {
          await navigator.share(data);
        } catch (e) {
          const name = (e as Error).name;
          if (name === "NotAllowedError") toast.info("PDF sudah sedia — tekan Kongsi sekali lagi.");
          else if (name !== "AbortError") setFallback(true);
        }
      } else {
        setFallback(true);
      }
    } catch {
      toast.error("PDF tidak dapat dijana. Sila cuba lagi.");
    } finally {
      setBusy(false);
    }
  }

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
    } catch {
      toast.error("PDF tidak dapat dimuat turun.");
    }
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

  const waHref = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(fullMessage)}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(fullMessage)}`;

  return (
    <div className="space-y-2">
      <div className={compact ? "flex flex-wrap gap-2" : "grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"}>
        <Button type="button" onClick={onShare} disabled={busy} size={compact ? "sm" : "default"} className="col-span-2 sm:col-span-1">
          {busy ? <Loader2 className="animate-spin" /> : <Share2 />} Kongsi PDF
        </Button>
        <Button asChild variant="outline" size={compact ? "sm" : "default"} className="border-[#25d366]/40 text-[#128c4a]">
          <a href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a>
        </Button>
        <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={download}><Download /> PDF</Button>
        {link && (
          <Button type="button" variant="outline" size={compact ? "sm" : "default"} onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Disalin" : "Salin pautan"}
          </Button>
        )}
      </div>

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
            <Button type="button" variant="outline" onClick={download}><Download /> Muat turun PDF</Button>
            <Button asChild variant="outline"><a href={mailHref}><Mail /> E-mel</a></Button>
            <Button asChild variant="outline"><a href={waHref} target="_blank" rel="noopener noreferrer"><MessageCircle /> WhatsApp</a></Button>
            {link && <Button type="button" variant="outline" onClick={copy}><Copy /> Salin pautan</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
