"use client";
import * as React from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReceiptUpload } from "@/components/receipt-upload";
import { formatPct, formatRM, todayKL } from "@/lib/format";
import { defaultCoopRateBp } from "./calc";
import {
  confirmDeclarationAction, deleteDeclarationDraftAction, deleteProjectDraftAction, markProfitReceivedAction, publishProjectAction,
  recordCapitalReturnsAction, recordInvestmentAction, recordMaturityAction, recordWithdrawalPaymentAction, reverseCapitalReturnAction,
  reviewParticipationAction, reviewWithdrawalAction, saveDeclarationAction, setProjectStatusAction, voidDeclarationAction,
} from "./actions";
import type { ProfitDeclaration } from "@/types/db";

/** A button that asks "are you sure?" before submitting a small action form. */
function Confirmed({ action, fields, label, confirm, variant = "outline", children }: {
  action: Parameters<typeof ActionForm>[0]["action"]; fields: Record<string, string>; label: string; confirm: string;
  variant?: "outline" | "default" | "destructive"; children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <Button type="button" variant={variant} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <ActionForm action={action} className="w-full space-y-2 rounded-lg border bg-muted/40 p-3" onSuccess={() => setOpen(false)}>
      {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <p className="text-sm font-medium">{confirm}</p>
      {children}
      <div className="flex gap-2">
        <SubmitButton size="sm" variant={variant === "outline" ? "default" : variant}>Ya, teruskan</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </ActionForm>
  );
}

export function PublishButton({ id }: { id: string }) {
  return <Confirmed action={publishProjectAction} fields={{ id }} variant="default" label="Terbitkan projek"
    confirm="Terbitkan projek ini kepada semua ahli? Sasaran, minimum, gandaan dan had tidak boleh diubah selepas ini." />;
}

export function DeleteDraftButton({ id }: { id: string }) {
  return <Confirmed action={deleteProjectDraftAction} fields={{ id }} variant="destructive" label="Padam draf" confirm="Padam draf projek ini?" />;
}

export function StatusButton({ id, status, label, confirm, variant }: { id: string; status: "open" | "full" | "completed"; label: string; confirm: string; variant?: "outline" | "default" }) {
  return <Confirmed action={setProjectStatusAction} fields={{ id, status }} label={label} confirm={confirm} variant={variant} />;
}

export function CancelProjectButton({ id }: { id: string }) {
  return (
    <Confirmed action={setProjectStatusAction} fields={{ id, status: "cancelled" }} variant="destructive" label="Batalkan projek"
      confirm="Batalkan projek? Bayaran yang menunggu akan ditolak dan ahli dimaklumkan. Modal yang diluluskan perlu dipulangkan (rekod bayaran balik).">
      <FormField label="Sebab pembatalan" htmlFor="cancel-reason" name="reason" required>
        <Input id="cancel-reason" name="reason" maxLength={500} />
      </FormField>
    </Confirmed>
  );
}

export function ParticipationReviewForm({ id }: { id: string }) {
  return (
    <ActionForm action={reviewParticipationAction} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="notes" placeholder="Catatan / sebab penolakan" className="h-8 text-xs" aria-label="Catatan semakan" />
      <div className="flex gap-2">
        <SubmitButton size="sm" name="decision" value="approve" className="flex-1">Lulus</SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="reject" className="flex-1 text-danger">Tolak</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function InvestmentForm({ id, adminId, capitalSen }: { id: string; adminId: string; capitalSen: number }) {
  return (
    <ActionForm action={recordInvestmentAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Jumlah dilaburkan (RM)" htmlFor="inv-amount" name="amount" required hint={`Modal terkumpul ${formatRM(capitalSen)}`}>
          <Input id="inv-amount" name="amount" inputMode="decimal" defaultValue={(capitalSen / 100).toFixed(2)} />
        </FormField>
        <FormField label="Tarikh pelaburan" htmlFor="invested_on" required>
          <Input id="invested_on" name="invested_on" type="date" max={todayKL()} defaultValue={todayKL()} />
        </FormField>
        <FormField label="Rujukan pelaburan / pindahan" htmlFor="inv-ref" name="reference" required className="space-y-1.5 sm:col-span-2">
          <Input id="inv-ref" name="reference" placeholder="cth. no. sijil / rujukan bank" />
        </FormField>
      </div>
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Bukti pelaburan (pilihan)" required={false} />
      <SubmitButton>Rekod pelaburan</SubmitButton>
    </ActionForm>
  );
}

export function MaturityForm({ id, adminId, investedSen }: { id: string; adminId: string; investedSen: number }) {
  return (
    <ActionForm action={recordMaturityAction} className="space-y-4">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tarikh matang" htmlFor="matured_on" required>
          <Input id="matured_on" name="matured_on" type="date" max={todayKL()} defaultValue={todayKL()} />
        </FormField>
        <FormField label="Modal diterima semula (RM)" htmlFor="capital_received" required hint={`Dilaburkan ${formatRM(investedSen)}. Isi jumlah sebenar; kurang bermakna kerugian.`}>
          <Input id="capital_received" name="capital_received" inputMode="decimal" defaultValue={(investedSen / 100).toFixed(2)} />
        </FormField>
        <FormField label="Rujukan (pilihan)" htmlFor="mat-ref" name="reference" className="space-y-1.5 sm:col-span-2">
          <Input id="mat-ref" name="reference" />
        </FormField>
      </div>
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Bukti (pilihan)" required={false} />
      <SubmitButton>Tandakan matang</SubmitButton>
    </ActionForm>
  );
}

/** Profit announcement draft. The cooperative's points are prefilled from the project's rule. */
export function DeclarationForm({ projectId, adminId, capitalSen, thresholdBp, capBp, declaration: d }: {
  projectId: string; adminId: string; capitalSen: number; thresholdBp: number; capBp: number; declaration?: ProfitDeclaration;
}) {
  const [rate, setRate] = React.useState(d ? formatPct(d.rate_bp).replace("%", "") : "");
  const [gross, setGross] = React.useState(d ? (Number(d.gross_sen) / 100).toFixed(2) : "");
  const [grossTouched, setGrossTouched] = React.useState(!!d);
  const [coop, setCoop] = React.useState(d ? formatPct(d.coop_rate_bp).replace("%", "") : "");
  const [coopTouched, setCoopTouched] = React.useState(!!d);
  const rateBp = Math.round(Number(rate.replace(",", ".")) * 100);
  const valid = Number.isFinite(rateBp) && rateBp >= 0;
  const suggestedCoop = valid ? defaultCoopRateBp(rateBp, thresholdBp, capBp) : 0;

  function onRate(v: string) {
    setRate(v);
    const bp = Math.round(Number(v.replace(",", ".")) * 100);
    if (!Number.isFinite(bp) || bp < 0) return;
    if (!grossTouched) setGross(((capitalSen * bp) / 1000000).toFixed(2));
    if (!coopTouched) setCoop(formatPct(defaultCoopRateBp(bp, thresholdBp, capBp)).replace("%", ""));
  }
  const coopBp = Math.round(Number(coop.replace(",", ".")) * 100);

  return (
    <ActionForm action={saveDeclarationAction} className="space-y-4">
      {d && <input type="hidden" name="id" value={d.id} />}
      <input type="hidden" name="project_id" value={projectId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tempoh keuntungan" htmlFor="period_label" required hint="cth. Tahun 2027 / Tahun Pertama">
          <Input id="period_label" name="period_label" defaultValue={d?.period_label} />
        </FormField>
        <FormField label="Tarikh pengumuman" htmlFor="announced_on" required>
          <Input id="announced_on" name="announced_on" type="date" max={todayKL()} defaultValue={d?.announced_on ?? todayKL()} />
        </FormField>
        <FormField label="Tempoh mula (pilihan)" htmlFor="period_start">
          <Input id="period_start" name="period_start" type="date" defaultValue={d?.period_start ?? ""} />
        </FormField>
        <FormField label="Tempoh akhir (pilihan)" htmlFor="period_end">
          <Input id="period_end" name="period_end" type="date" defaultValue={d?.period_end ?? ""} />
        </FormField>
        <FormField label="Kadar keuntungan diumumkan (%)" htmlFor="rate" required hint="Kadar yang diumumkan oleh organisasi, cth. 10">
          <Input id="rate" name="rate" inputMode="decimal" value={rate} onChange={(e) => onRate(e.target.value)} />
        </FormField>
        <FormField label="Jumlah keuntungan kasar (RM)" htmlFor="gross" required hint={`Modal ${formatRM(capitalSen)} × kadar. Ubah jika jumlah sebenar berbeza.`}>
          <Input id="gross" name="gross" inputMode="decimal" value={gross} onChange={(e) => { setGross(e.target.value); setGrossTouched(true); }} />
        </FormField>
        <FormField label="Potongan / caj (RM, pilihan)" htmlFor="fee" hint="cth. yuran pentadbiran atau caj bank yang ditolak">
          <Input id="fee" name="fee" inputMode="decimal" defaultValue={d && Number(d.fee_sen) ? (Number(d.fee_sen) / 100).toFixed(2) : ""} />
        </FormField>
        <FormField label="Jenis potongan" htmlFor="fee_description">
          <Input id="fee_description" name="fee_description" defaultValue={d?.fee_description ?? ""} placeholder="cth. Yuran pentadbiran" />
        </FormField>
        <FormField label="Bahagian koperasi (mata peratusan)" htmlFor="coop_rate" required
          hint={valid ? `Cadangan peraturan projek: ${formatPct(suggestedCoop)}. Ahli menerima ${formatPct(Math.max(rateBp - (Number.isFinite(coopBp) ? coopBp : suggestedCoop), 0))}.` : undefined}>
          <Input id="coop_rate" name="coop_rate" inputMode="decimal" value={coop} onChange={(e) => { setCoop(e.target.value); setCoopTouched(true); }} />
        </FormField>
        <FormField label="Catatan (pilihan)" htmlFor="decl-notes" name="notes">
          <Input id="decl-notes" name="notes" defaultValue={d?.notes ?? ""} />
        </FormField>
      </div>
      {d?.document_path && <input type="hidden" name="document_path" value={d.document_path} />}
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="new_document_path"
        label={d?.document_path ? "Gantikan dokumen pengumuman / penyata (pilihan)" : "Dokumen pengumuman / penyata (pilihan)"} required={false} />
      <SubmitButton>Simpan draf dan semak agihan</SubmitButton>
    </ActionForm>
  );
}

export function ConfirmDeclarationForm({ id, projectId }: { id: string; projectId: string }) {
  const [received, setReceived] = React.useState<"ya" | "belum">("belum");
  return (
    <ActionForm action={confirmDeclarationAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="project_id" value={projectId} />
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1 font-medium">Adakah wang keuntungan sudah diterima koperasi?</legend>
        <label className="flex items-center gap-2"><input type="radio" name="received" value="belum" checked={received === "belum"} onChange={() => setReceived("belum")} /> Belum. Umumkan dahulu; dividen belum boleh dipohon.</label>
        <label className="flex items-center gap-2"><input type="radio" name="received" value="ya" checked={received === "ya"} onChange={() => setReceived("ya")} /> Sudah diterima. Dividen terus tersedia untuk pengeluaran.</label>
      </fieldset>
      {received === "ya" && (
        <FormField label="Tarikh wang diterima" htmlFor="received_on" required>
          <Input id="received_on" name="received_on" type="date" max={todayKL()} defaultValue={todayKL()} className="max-w-48" />
        </FormField>
      )}
      <p className="text-xs text-muted-foreground">Selepas disahkan, pengumuman dikunci. Pembetulan hanya melalui pembatalan dengan sebab.</p>
      <SubmitButton>Sahkan pengumuman</SubmitButton>
    </ActionForm>
  );
}

export function DeleteDeclarationDraftButton({ id, projectId }: { id: string; projectId: string }) {
  return <Confirmed action={deleteDeclarationDraftAction} fields={{ id, project_id: projectId }} variant="destructive" label="Padam draf" confirm="Padam draf pengumuman ini?" />;
}

export function MarkReceivedForm({ id, projectId }: { id: string; projectId: string }) {
  return (
    <ActionForm action={markProfitReceivedAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="project_id" value={projectId} />
      <FormField label="Tarikh wang diterima" htmlFor={`recv-${id}`} name="received_on">
        <Input id={`recv-${id}`} name="received_on" type="date" max={todayKL()} defaultValue={todayKL()} className="h-9" />
      </FormField>
      <SubmitButton size="sm">Tandakan wang diterima</SubmitButton>
    </ActionForm>
  );
}

export function VoidDeclarationButton({ id, projectId }: { id: string; projectId: string }) {
  return (
    <Confirmed action={voidDeclarationAction} fields={{ id, project_id: projectId }} variant="destructive" label="Batalkan pengumuman"
      confirm="Batalkan pengumuman ini untuk pembetulan? Dividen ahli daripada pengumuman ini akan ditarik balik. Tidak dibenarkan jika ada dividen yang telah dipohon atau dibayar.">
      <FormField label="Sebab" htmlFor={`void-${id}`} name="reason" required>
        <Input id={`void-${id}`} name="reason" maxLength={500} />
      </FormField>
    </Confirmed>
  );
}

/** Capital return (matured) or refund (cancelled) for several members at once. */
export function CapitalReturnForm({ projectId, adminId, kind, members }: {
  projectId: string; adminId: string; kind: "return" | "refund";
  members: { member_id: string; name: string; membership_id: string | null; capital_sen: number; returned_sen: number; suggested_sen: number }[];
}) {
  return (
    <ActionForm action={recordCapitalReturnsAction} className="space-y-4">
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="kind" value={kind} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Ahli</th><th className="p-2 text-right">Modal</th><th className="p-2 text-right">Telah dipulangkan</th><th className="p-2 text-right">Jumlah kali ini (RM)</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.member_id} className="border-t">
                <td className="p-2">{m.name}<span className="block text-xs text-muted-foreground">{m.membership_id}</span></td>
                <td className="p-2 text-right tabular-nums">{formatRM(m.capital_sen)}</td>
                <td className="p-2 text-right tabular-nums">{formatRM(m.returned_sen)}</td>
                <td className="p-2 text-right">
                  <Input name={`amount_${m.member_id}`} inputMode="decimal" aria-label={`Jumlah untuk ${m.name}`} className="ml-auto h-8 w-28 text-right"
                    defaultValue={m.suggested_sen > 0 ? (m.suggested_sen / 100).toFixed(2) : ""} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Tarikh pindahan" htmlFor={`paid_on-${kind}`} name="paid_on" required>
          <Input id={`paid_on-${kind}`} name="paid_on" type="date" max={todayKL()} defaultValue={todayKL()} />
        </FormField>
        <FormField label="Rujukan pindahan" htmlFor={`ref-${kind}`} name="reference" required>
          <Input id={`ref-${kind}`} name="reference" />
        </FormField>
        <FormField label="Catatan (pilihan)" htmlFor={`notes-${kind}`} name="notes" className="space-y-1.5 sm:col-span-2">
          <Input id={`notes-${kind}`} name="notes" />
        </FormField>
      </div>
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Bukti pindahan (pilihan)" required={false} />
      <SubmitButton>{kind === "refund" ? "Rekod bayaran balik" : "Rekod pemulangan modal"}</SubmitButton>
    </ActionForm>
  );
}

export function ReverseCapitalReturnButton({ id, projectId }: { id: string; projectId: string }) {
  return (
    <Confirmed action={reverseCapitalReturnAction} fields={{ id, project_id: projectId }} variant="destructive" label="Balikkan" confirm="Balikkan rekod pemulangan ini?">
      <FormField label="Sebab" htmlFor={`rev-${id}`} name="reason" required><Input id={`rev-${id}`} name="reason" /></FormField>
    </Confirmed>
  );
}

export function WithdrawalReviewForm({ id, status }: { id: string; status: string }) {
  return (
    <ActionForm action={reviewWithdrawalAction} className="flex min-w-56 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="notes" placeholder="Catatan / sebab penolakan" className="h-8 text-xs" aria-label="Catatan" />
      <div className="flex gap-2">
        {status === "pending" && <SubmitButton size="sm" name="decision" value="approve" className="flex-1">Lulus</SubmitButton>}
        <SubmitButton size="sm" variant="outline" name="decision" value="reject" className="flex-1 text-danger">Tolak</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function WithdrawalPaidForm({ id, adminId }: { id: string; adminId: string }) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Rekod bayaran</Button>;
  return (
    <ActionForm action={recordWithdrawalPaymentAction} className="w-full min-w-64 space-y-3 rounded-lg border bg-muted/30 p-3" onSuccess={() => setOpen(false)}>
      <input type="hidden" name="id" value={id} />
      <ReceiptUpload userId={adminId} bucket="payout-proofs" name="proof_path" label="Resit pindahan daripada Bendahari"
        autofill={{ date: "paid_on", reference: "reference" }} />
      <FormField label="Tarikh pindahan" htmlFor={`paid-${id}`} name="paid_on" required>
        <Input id={`paid-${id}`} name="paid_on" type="date" max={todayKL()} defaultValue={todayKL()} />
      </FormField>
      <FormField label="Rujukan transaksi bank" htmlFor={`pref-${id}`} name="reference" required>
        <Input id={`pref-${id}`} name="reference" />
      </FormField>
      <div className="flex gap-2">
        <SubmitButton size="sm" className="flex-1">Sahkan telah dibayar</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </ActionForm>
  );
}

