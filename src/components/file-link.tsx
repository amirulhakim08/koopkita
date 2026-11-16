import { FileText } from "lucide-react";

/** Opens a private file through the authorization-checked signed-URL route. */
export function FileLink({ bucket = "receipts", path, label = "Lihat resit" }: { bucket?: "receipts" | "payout-proofs"; path: string | null; label?: string }) {
  if (!path) return <span className="text-muted-foreground">-</span>;
  const href = `/api/fail?b=${bucket}&p=${encodeURIComponent(path)}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      <FileText className="size-3.5" /> {label}
    </a>
  );
}
