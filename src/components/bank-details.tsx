import { Landmark } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import type { BankSettings } from "@/lib/queries";

export function BankDetails({ bank, amountLabel }: { bank: BankSettings; amountLabel?: string }) {
  if (!bank.accountNo) {
    return (
      <Alert tone="warning" title="Akaun bank koperasi belum dikonfigurasi">
        Super Admin perlu menetapkan akaun bank rasmi koperasi sebelum pembayaran boleh dibuat.
      </Alert>
    );
  }
  return (
    <div className="rounded-xl border border-primary/15 bg-accent-soft p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        <Landmark className="size-4" /> Bayar terus ke akaun rasmi koperasi
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div><dt className="text-xs text-muted-foreground">Bank</dt><dd className="font-semibold">{bank.bankName ?? "-"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Nama akaun</dt><dd className="font-semibold">{bank.accountName ?? "-"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">No. akaun</dt><dd className="font-mono text-base font-bold tracking-wide">{bank.accountNo}</dd></div>
      </dl>
      {amountLabel && <p className="mt-3 text-sm">Jumlah perlu dibayar: <strong>{amountLabel}</strong></p>}
      {bank.instructions && <p className="mt-2 whitespace-pre-line text-xs text-muted-foreground">{bank.instructions}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Ahli tidak menerima bayaran pelanggan. Pelanggan mesti membayar terus ke akaun koperasi di atas.
      </p>
    </div>
  );
}
