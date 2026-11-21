"use client";
import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { ActionForm, FieldError, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { ReceiptUpload } from "@/components/receipt-upload";
import { formatRM, todayKL } from "@/lib/format";
import { joinProjectAction } from "./actions";
import { amountError, maxAllowedSen, minAllowedSen, type AmountRules } from "./calc";

type Props = {
  projectId: string; userId: string; targetSen: number; termsVersion: number; rules: AmountRules; bank: React.ReactNode;
};

/** Step 1 amount (− / + by the project's step), step 2 terms, step 3 bank transfer and receipt. */
export function JoinProjectForm({ projectId, userId, targetSen, termsVersion, rules, bank }: Props) {
  const min = minAllowedSen(rules);
  const max = maxAllowedSen(rules);
  const [amount, setAmount] = React.useState(Math.min(min, max));
  const [agreed, setAgreed] = React.useState(false);

  if (max <= 0 || min > max) {
    return (
      <Alert tone="info" title="Tiada baki untuk anda">
        {rules.availableSen <= 0 ? "Projek ini telah mencapai sasaran (termasuk bayaran yang menunggu pengesahan)."
          : rules.maxPerMemberSen != null && rules.mineSen >= rules.maxPerMemberSen ? `Anda telah mencapai had seorang ahli ${formatRM(rules.maxPerMemberSen)}.`
          : `Baki projek ${formatRM(rules.availableSen)} kurang daripada minimum ${formatRM(rules.minSen)}.`}
      </Alert>
    );
  }

  const err = amountError(amount, rules, formatRM);
  const share = targetSen ? ((rules.mineSen + amount) / targetSen) * 100 : 0;
  const step = (dir: 1 | -1) => setAmount((a) => Math.min(max, Math.max(min, a + dir * rules.stepSen)));

  return (
    <ActionForm action={joinProjectAction} className="space-y-6" resetOnSuccess onSuccess={() => { setAgreed(false); setAmount(Math.min(min, max)); }}>
      <IdempotencyKey />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="terms_version" value={termsVersion} />
      <input type="hidden" name="amount" value={(amount / 100).toFixed(2)} />

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">1. Jumlah penyertaan</h3>
        <p className="text-xs text-muted-foreground">
          Minimum {formatRM(rules.minSen)} · Gandaan {formatRM(rules.stepSen)}
          {rules.maxPerMemberSen != null && <> · Had seorang {formatRM(rules.maxPerMemberSen)}</>}
        </p>
        <div className="flex items-center gap-3">
          <Button type="button" variant="outline" size="icon" aria-label="Kurangkan" disabled={amount <= min} onClick={() => step(-1)}><Minus /></Button>
          <output className="flex-1 rounded-lg border bg-white py-2 text-center text-2xl font-bold tabular-nums" aria-live="polite">{formatRM(amount)}</output>
          <Button type="button" variant="outline" size="icon" aria-label="Tambah" disabled={amount >= max} onClick={() => step(1)}><Plus /></Button>
        </div>
        <FieldError name="amount" />
        {err && <p className="text-xs font-medium text-danger">{err}</p>}
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
          <div><dt className="text-muted-foreground">Pegangan anda selepas ini</dt><dd className="font-semibold">{share.toLocaleString("en-US", { maximumFractionDigits: 2 })}% daripada sasaran</dd></div>
          <div><dt className="text-muted-foreground">Baki projek selepas ini</dt><dd className="font-semibold">{formatRM(rules.availableSen - amount)}</dd></div>
          {rules.mineSen > 0 && <div className="col-span-2"><dt className="text-muted-foreground">Jumlah penyertaan anda</dt><dd className="font-semibold">{formatRM(rules.mineSen)} + {formatRM(amount)} = {formatRM(rules.mineSen + amount)}</dd></div>}
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">2. Terma dan risiko</h3>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="accept_terms" className="mt-0.5 size-4 accent-[var(--primary)]" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>Saya telah membaca terma dan pendedahan risiko projek ini. Saya faham pulangan lepas bukan jaminan dan modal boleh berkurang.</span>
        </label>
        <FieldError name="accept_terms" />
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold">3. Bayar dan muat naik bukti</h3>
        {bank}
        <ReceiptUpload userId={userId} autofill={{ date: "payment_date", reference: "transaction_ref" }} />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tarikh bayaran" htmlFor="payment_date" required>
            <Input id="payment_date" name="payment_date" type="date" max={todayKL()} defaultValue={todayKL()} />
          </FormField>
          <FormField label="Rujukan transaksi bank" htmlFor="transaction_ref" required>
            <Input id="transaction_ref" name="transaction_ref" placeholder="cth. MBB123456789" />
          </FormField>
        </div>
        <SubmitButton className="w-full" size="lg" disabled={!agreed || !!err}>Hantar Bukti Bayaran {formatRM(amount)}</SubmitButton>
      </section>
    </ActionForm>
  );
}
