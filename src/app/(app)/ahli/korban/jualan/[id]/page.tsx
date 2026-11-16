import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, IdempotencyKey, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { BankDetails } from "@/components/bank-details";
import { ReceiptUpload } from "@/components/receipt-upload";
import { requireActiveMember } from "@/lib/auth";
import { getBankSettings } from "@/lib/queries";
import { loadSale, ParticipantsTable, PaymentsList, SaleOverview } from "@/features/qurban/sale-details";
import { cancelSaleAction, submitSalePaymentAction } from "@/features/qurban/actions";
import { formatRM, todayKL, senToDecimal } from "@/lib/format";
import { z } from "zod";

export const metadata = { title: "Butiran Jualan" };

export default async function MemberSalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ baru?: string }> }) {
  const { userId } = await requireActiveMember();
  const { id } = await params;
  const { baru } = await searchParams;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const bundle = await loadSale(id);
  if (!bundle || bundle.sale.member_id !== userId) notFound();
  const bank = await getBankSettings();
  const { sale } = bundle;
  const canPay = (sale.status === "pending_payment" || sale.status === "pending_review") && bundle.remainingSen > 0;
  const canCancel = ["draft", "pending_payment", "pending_review"].includes(sale.status) && bundle.verifiedSen === 0;
  const commission = bundle.commission.reduce((a, c) => a + Number(c.amount_sen), 0);

  return (
    <>
      <Link href="/ahli/korban" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Jualan korban</Link>
      <PageHeader title="Butiran jualan" />
      {baru && sale.status === "pending_payment" && (
        <Alert tone="success" title="Slot berjaya ditempah" className="mb-6">
          Minta pelanggan membayar {formatRM(sale.total_sen)} terus ke akaun koperasi, kemudian muat naik bukti bayaran di bawah.
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SaleOverview bundle={bundle} />
          <div className="space-y-3">
            <h2 className="font-semibold">Peserta & peruntukan slot</h2>
            <ParticipantsTable bundle={bundle} />
          </div>
          {sale.status === "approved" && (
            <Alert tone="success" title="Jualan diluluskan">Komisen bagi jualan ini: <strong>{formatRM(commission)}</strong></Alert>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Bukti bayaran</CardTitle></CardHeader>
            <CardContent><PaymentsList bundle={bundle} /></CardContent>
          </Card>
          {canPay && (
            <Card>
              <CardHeader>
                <CardTitle>Muat naik bukti bayaran</CardTitle>
                <CardDescription>Baki belum dihantar: {formatRM(bundle.remainingSen)}. Bayaran separa dibenarkan.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <BankDetails bank={bank} amountLabel={formatRM(bundle.remainingSen)} />
                <ActionForm action={submitSalePaymentAction} className="space-y-4" resetOnSuccess>
                  <IdempotencyKey />
                  <input type="hidden" name="sale_id" value={sale.id} />
                  <ReceiptUpload userId={userId} autofill={{ amount: "amount", date: "payment_date", reference: "transaction_ref" }} />
                  <FormField label="Jumlah dibayar (RM)" htmlFor="amount" required>
                    <Input id="amount" name="amount" inputMode="decimal" defaultValue={senToDecimal(bundle.remainingSen)} />
                  </FormField>
                  <FormField label="Tarikh bayaran" htmlFor="payment_date" required>
                    <Input id="payment_date" name="payment_date" type="date" max={todayKL()} defaultValue={todayKL()} />
                  </FormField>
                  <FormField label="Rujukan transaksi bank" htmlFor="transaction_ref" required>
                    <Input id="transaction_ref" name="transaction_ref" />
                  </FormField>
                  <SubmitButton className="w-full">Hantar untuk semakan</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
          {canCancel && (
            <Card>
              <CardHeader><CardTitle>Batal jualan</CardTitle><CardDescription>Slot akan dilepaskan untuk jualan lain.</CardDescription></CardHeader>
              <CardContent>
                <ActionForm action={cancelSaleAction} className="space-y-3">
                  <input type="hidden" name="sale_id" value={sale.id} />
                  <FormField label="Sebab" htmlFor="reason" required><Textarea id="reason" name="reason" rows={2} /></FormField>
                  <SubmitButton variant="destructive" className="w-full">Batal jualan</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
