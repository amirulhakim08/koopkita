import { Clock, Coins, Wallet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { ReceiptUpload } from "@/components/receipt-upload";
import { BankDetails } from "@/components/bank-details";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/empty-state";
import { FileLink } from "@/components/file-link";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getBankSettings, getSettings } from "@/lib/queries";
import { submitSharePaymentAction } from "@/features/shares/actions";
import { formatDate, formatRM, todayKL } from "@/lib/format";
import { REVIEW_STATUS } from "@/lib/labels";
import type { ShareTransaction } from "@/types/db";

export const metadata = { title: "Modal Saham" };

export default async function SharesPage() {
  const { userId } = await requireActiveMember();
  const supabase = await createClient();
  const [{ data: balance }, { data: txns }, bank, settings] = await Promise.all([
    supabase.from("v_share_balances").select("*").eq("member_id", userId).maybeSingle(),
    supabase.from("share_transactions").select("*").eq("member_id", userId).order("created_at", { ascending: false }),
    getBankSettings(),
    getSettings(),
  ]);
  const minPayment = Number(settings.share_min_payment_sen ?? 1000);
  const minTotal = Number(settings.share_min_total_sen ?? 0);
  const maxTotal = Number(settings.share_max_total_sen ?? 0);

  return (
    <>
      <PageHeader title="Modal saham" description="Hanya transaksi yang diluluskan dikira dalam baki modal saham anda." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <StatCard emphasis label="Baki diluluskan" value={formatRM(balance?.approved_sen)} icon={Coins} />
        <StatCard label="Menunggu semakan" value={formatRM(balance?.pending_sen)} icon={Clock} hint={`${balance?.pending_count ?? 0} transaksi`} />
        <StatCard label="Had modal saham" value={`${formatRM(minTotal)} – ${formatRM(maxTotal)}`} icon={Wallet} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hantar bayaran saham</CardTitle>
            <CardDescription>Bayar ke akaun koperasi, kemudian muat naik resit. Minimum {formatRM(minPayment)}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <BankDetails bank={bank} />
            <ActionForm action={submitSharePaymentAction} className="space-y-4" resetOnSuccess>
              <IdempotencyKey />
              <FormField label="Jumlah (RM)" htmlFor="amount" required>
                <Input id="amount" name="amount" inputMode="decimal" placeholder="100.00" />
              </FormField>
              <FormField label="Tarikh bayaran" htmlFor="payment_date" required>
                <Input id="payment_date" name="payment_date" type="date" max={todayKL()} defaultValue={todayKL()} />
              </FormField>
              <FormField label="Rujukan transaksi bank" htmlFor="transaction_ref" required>
                <Input id="transaction_ref" name="transaction_ref" placeholder="cth. MBB123456789" />
              </FormField>
              <ReceiptUpload userId={userId} />
              <SubmitButton className="w-full">Hantar untuk semakan</SubmitButton>
            </ActionForm>
          </CardContent>
        </Card>

        <div className="space-y-3 lg:col-span-3">
          <h2 className="font-semibold">Sejarah transaksi</h2>
          {txns?.length ? (
            <Table>
              <THead><TR><TH>Tarikh</TH><TH>Jenis</TH><TH>Rujukan</TH><TH className="text-right">Jumlah</TH><TH>Status</TH><TH>Resit</TH></TR></THead>
              <TBody>
                {(txns as ShareTransaction[]).map((t) => (
                  <TR key={t.id}>
                    <TD>{formatDate(t.payment_date ?? t.created_at)}</TD>
                    <TD>{t.txn_type === "payment" ? "Bayaran" : <Badge tone="info">Pelarasan</Badge>}</TD>
                    <TD className="max-w-48">
                      <span className="font-mono text-xs">{t.transaction_ref ?? "-"}</span>
                      {t.reason && <p className="text-xs text-muted-foreground">{t.reason}</p>}
                      {t.status === "rejected" && t.review_notes && <p className="text-xs text-danger">Sebab: {t.review_notes}</p>}
                    </TD>
                    <TD className={`text-right font-semibold tabular-nums ${t.amount_sen < 0 ? "text-danger" : ""}`}>{formatRM(t.amount_sen)}</TD>
                    <TD><StatusBadge map={REVIEW_STATUS} value={t.status} /></TD>
                    <TD><FileLink path={t.receipt_path} label="Resit" /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : <EmptyState icon={Coins} title="Tiada transaksi" description="Bayaran saham yang dihantar akan dipaparkan di sini." />}
        </div>
      </div>
    </>
  );
}
