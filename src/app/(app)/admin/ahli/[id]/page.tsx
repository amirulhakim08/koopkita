import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { BankSelect } from "@/components/bank-select";
import { Input, Select, Textarea } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminUpdateMemberAction, approveMemberAction, rejectMemberAction, setSuspensionAction } from "@/features/members/actions";
import { formatDateTime, formatIc, formatRM } from "@/lib/format";
import { MALAYSIAN_STATES, MEMBER_STATUS, PROJECT_STATUS } from "@/lib/labels";
import type { MemberProjectWallet, Profile } from "@/types/db";

export const metadata = { title: "Butiran Ahli" };

export default async function MemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { userId: adminId } = await requireAdmin();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const m = data as Profile;
  const [{ data: balance }, { data: wallet }, { data: application }] = await Promise.all([
    supabase.from("v_share_balances").select("*").eq("member_id", id).maybeSingle(),
    supabase.rpc("member_project_wallet", { p_member_id: id }),
    supabase.from("membership_applications").select("*").eq("user_id", id).order("submitted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const self = id === adminId;
  const projects = (wallet ?? []) as MemberProjectWallet[];
  const total = (k: keyof MemberProjectWallet) => projects.reduce((t, p) => t + Number(p[k] ?? 0), 0);

  return (
    <>
      <Link href="/admin/ahli" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"><ArrowLeft className="size-4" /> Senarai ahli</Link>
      <PageHeader title={m.full_name} description={<span className="inline-flex flex-wrap items-center gap-2">{m.membership_id ?? "Belum diberi No. Ahli"} <StatusBadge map={MEMBER_STATUS} value={m.status} /></span>} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Maklumat ahli</CardTitle><CardDescription>Data peribadi sulit — jangan kongsi di luar urusan koperasi.</CardDescription></CardHeader>
            <CardContent>
              <ActionForm action={adminUpdateMemberAction} className="space-y-4">
                <input type="hidden" name="user_id" value={m.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Nama penuh" htmlFor="full_name" required><Input id="full_name" name="full_name" defaultValue={m.full_name} /></FormField>
                  <FormField label="No. Kad Pengenalan" htmlFor="ic_number" required hint={formatIc(m.ic_number)}><Input id="ic_number" name="ic_number" defaultValue={m.ic_number ?? ""} /></FormField>
                  <FormField label="No. telefon" htmlFor="phone" required><Input id="phone" name="phone" defaultValue={m.phone ?? ""} /></FormField>
                  <FormField label="E-mel" htmlFor="email_ro"><Input id="email_ro" value={m.email} disabled readOnly /></FormField>
                </div>
                <FormField label="Alamat" htmlFor="address" required><Textarea id="address" name="address" rows={2} defaultValue={m.address ?? ""} /></FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField label="Negeri" htmlFor="state" required>
                    <Select id="state" name="state" defaultValue={m.state ?? "Kedah"}>{MALAYSIAN_STATES.map((s) => <option key={s}>{s}</option>)}</Select>
                  </FormField>
                  <FormField label="Poskod" htmlFor="postcode" required><Input id="postcode" name="postcode" defaultValue={m.postcode ?? ""} /></FormField>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField label="Nama bank" htmlFor="bank_name"><BankSelect defaultValue={m.bank_name} /></FormField>
                  <FormField label="No. akaun" htmlFor="bank_account_no"><Input id="bank_account_no" name="bank_account_no" defaultValue={m.bank_account_no ?? ""} /></FormField>
                  <FormField label="Pemegang akaun" htmlFor="bank_account_holder"><Input id="bank_account_holder" name="bank_account_holder" defaultValue={m.bank_account_holder ?? ""} /></FormField>
                </div>
                <SubmitButton>Simpan</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Projek</CardTitle></CardHeader>
            <CardContent>
              {projects.length ? (
                <ul className="divide-y text-sm">
                  {projects.map((p) => (
                    <li key={p.project_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/admin/projek/${p.project_id}`} className="font-medium text-primary hover:underline">{p.name}</Link>
                      <span className="tabular-nums">Modal {formatRM(p.capital_sen)} · Dividen {formatRM(p.dividend_declared_sen)} · Tersedia {formatRM(p.available_sen)}</span>
                      <StatusBadge map={PROJECT_STATUS} value={p.status} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Belum menyertai projek.</p>}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Ringkasan</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-muted-foreground">Modal syer</span><strong>{formatRM(balance?.approved_sen)}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Syer menunggu</span><span>{formatRM(balance?.pending_sen)}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Modal projek</span><strong>{formatRM(total("capital_sen"))}</strong></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Dividen projek</span><span>{formatRM(total("dividend_declared_sen"))}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Dividen belum dibayar</span><strong>{formatRM(total("dividend_declared_sen") - total("withdrawn_sen"))}</strong></p>
              <p className="flex justify-between border-t pt-2"><span className="text-muted-foreground">Didaftar</span><span>{formatDateTime(m.created_at)}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">E-mel disahkan</span><span>{formatDateTime(m.email_verified_at)}</span></p>
              <p className="flex justify-between"><span className="text-muted-foreground">Diluluskan</span><span>{formatDateTime(m.approved_at)}</span></p>
              {m.status_reason && <p className="rounded bg-muted p-2 text-xs">Sebab status: {m.status_reason}</p>}
              {application?.review_notes && <p className="rounded bg-muted p-2 text-xs">Catatan permohonan: {application.review_notes}</p>}
            </CardContent>
          </Card>

          {self ? (
            <Alert tone="info">Anda tidak boleh menukar status akaun anda sendiri.</Alert>
          ) : (
            <>
              {(m.status === "pending_approval" || m.status === "pending_verification") && (
                <Card>
                  <CardHeader><CardTitle>Semak permohonan</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {m.status === "pending_verification" && (
                      <Alert tone="info">E-mel pemohon belum disahkan. Meluluskan permohonan ini akan mengesahkan e-mel secara automatik dan ahli boleh terus log masuk.</Alert>
                    )}
                    {(m.status === "pending_approval" || m.status === "pending_verification") && (
                      <ActionForm action={approveMemberAction} className="space-y-3">
                        <input type="hidden" name="user_id" value={m.id} />
                        <FormField label="Catatan (pilihan)" htmlFor="approve_notes" name="notes"><Input id="approve_notes" name="notes" /></FormField>
                        <SubmitButton className="w-full">Luluskan & beri No. Ahli</SubmitButton>
                      </ActionForm>
                    )}
                    <ActionForm action={rejectMemberAction} className="space-y-3 border-t pt-4">
                      <input type="hidden" name="user_id" value={m.id} />
                      <FormField label="Sebab penolakan" htmlFor="reject_notes" name="notes" required><Textarea id="reject_notes" name="notes" rows={2} /></FormField>
                      <SubmitButton variant="destructive" className="w-full">Tolak permohonan</SubmitButton>
                    </ActionForm>
                  </CardContent>
                </Card>
              )}
              {(m.status === "active" || m.status === "suspended") && (
                <Card>
                  <CardHeader><CardTitle>{m.status === "active" ? "Gantung akaun" : "Aktifkan semula"}</CardTitle></CardHeader>
                  <CardContent>
                    <ActionForm action={setSuspensionAction} className="space-y-3">
                      <input type="hidden" name="user_id" value={m.id} />
                      <input type="hidden" name="suspend" value={m.status === "active" ? "true" : "false"} />
                      <FormField label="Sebab" htmlFor="reason" required><Textarea id="reason" name="reason" rows={2} /></FormField>
                      <SubmitButton variant={m.status === "active" ? "destructive" : "default"} className="w-full">
                        {m.status === "active" ? "Gantung akaun" : "Aktifkan semula"}
                      </SubmitButton>
                    </ActionForm>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
