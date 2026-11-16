"use client";
import * as React from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Select, Textarea } from "@/components/ui/input";
import { ReceiptUpload } from "@/components/receipt-upload";
import { recordCoopEntryAction, reverseCoopEntryAction } from "@/features/finance/actions";
import { BUSINESSES, FINANCE_IN_CATEGORIES, FINANCE_OUT_CATEGORIES } from "@/lib/labels";
import { todayKL } from "@/lib/format";
import { cn } from "@/lib/utils";

export function CoopEntryForm({ adminId }: { adminId: string }) {
  const [direction, setDirection] = React.useState<"in" | "out">("out");
  const categories = direction === "in" ? FINANCE_IN_CATEGORIES : FINANCE_OUT_CATEGORIES;
  // remount the form when the direction changes so the category resets
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1" role="tablist" aria-label="Jenis rekod">
        {([["out", "Wang keluar", ArrowUpRight], ["in", "Wang masuk", ArrowDownLeft]] as const).map(([d, label, Icon]) => (
          <button key={d} type="button" role="tab" aria-selected={direction === d} onClick={() => setDirection(d)}
            className={cn("flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-colors",
              direction === d ? (d === "out" ? "bg-white text-danger shadow-sm" : "bg-white text-success shadow-sm") : "text-muted-foreground")}>
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      <ActionForm key={direction} action={recordCoopEntryAction} className="space-y-4" resetOnSuccess>
        <IdempotencyKey />
        <input type="hidden" name="direction" value={direction} />
        <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Bukti / resit (pilihan)" required={false} autofill={{ amount: "amount", date: "entry_date", reference: "reference" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Kategori" htmlFor="category" required>
            <Select id="category" name="category" defaultValue="">
              <option value="" disabled>— Pilih —</option>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label="Perniagaan" htmlFor="business" required>
            <Select id="business" name="business" defaultValue="umum">
              {Object.entries(BUSINESSES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </FormField>
          <FormField label="Jumlah (RM)" htmlFor="amount" required>
            <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" />
          </FormField>
          <FormField label="Tarikh" htmlFor="entry_date" required>
            <Input id="entry_date" name="entry_date" type="date" max={todayKL()} defaultValue={todayKL()} />
          </FormField>
        </div>
        <FormField label={direction === "out" ? "Sebab pengeluaran" : "Keterangan"} htmlFor="description" name="description" required
          hint={direction === "out" ? "Wajib: nyatakan tujuan wang dikeluarkan." : undefined}>
          <Textarea id="description" name="description" rows={2} maxLength={500} />
        </FormField>
        <FormField label="Rujukan bank / resit (pilihan)" htmlFor="reference"><Input id="reference" name="reference" maxLength={100} /></FormField>
        <SubmitButton className="w-full" variant={direction === "out" ? "destructive" : "default"}>
          {direction === "out" ? "Rekod pengeluaran" : "Rekod wang masuk"}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function ReverseEntryForm({ entryId }: { entryId: string }) {
  return (
    <ActionForm action={reverseCoopEntryAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="entry_id" value={entryId} />
      <Input name="reason" placeholder="Sebab" className="h-7 w-28 text-xs" aria-label="Sebab pembalikan" />
      <SubmitButton size="sm" variant="ghost" className="h-7 px-2 text-xs text-danger" pendingText="…">Balikkan</SubmitButton>
    </ActionForm>
  );
}
