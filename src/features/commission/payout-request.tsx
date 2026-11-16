import Link from "next/link";
import { Landmark } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { cancelPayoutRequestAction, requestPayoutAction } from "@/features/commission/actions";
import { formatDateTime, formatRM } from "@/lib/format";
import { PAYOUT_REQUEST_STATUS } from "@/lib/labels";
import type { Profile } from "@/types/db";

export type PayoutRequest = {
  id: string; amount_sen: number; bank_name: string; bank_account_no: string; bank_account_holder: string;
  status: string; review_notes: string | null; created_at: string;
};

export function hasValidBank(p: Pick<Profile, "bank_name" | "bank_account_no" | "bank_account_holder">) {
  return Boolean(p.bank_name && p.bank_name.trim().length >= 2 && p.bank_account_no && /^[0-9]{6,20}$/.test(p.bank_account_no)
    && p.bank_account_holder && p.bank_account_holder.trim().length >= 3);
}

export function PayoutRequestCard({ profile, outstandingSen, requests }: { profile: Profile; outstandingSen: number; requests: PayoutRequest[] }) {
  const pending = requests.find((r) => r.status === "pending");
  const validBank = hasValidBank(profile);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Landmark className="size-5 text-primary" /> Mohon pemindahan komisen</CardTitle>
        <CardDescription>Komisen dipindahkan secara manual oleh admin koperasi ke akaun bank anda.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <p className="text-xs text-muted-foreground">Akaun penerima (daripada profil)</p>
          {validBank ? (
            <p className="font-medium">{profile.bank_name} · <span className="font-mono">{profile.bank_account_no}</span> · {profile.bank_account_holder}</p>
          ) : (
            <p className="text-danger">Belum lengkap atau tidak sah.</p>
          )}
        </div>
        {pending ? (
          <div className="space-y-3">
            <Alert tone="warning" title={`Permohonan ${formatRM(pending.amount_sen)} sedang diproses`}>
              Dihantar {formatDateTime(pending.created_at)} ke {pending.bank_name} {pending.bank_account_no}.
            </Alert>
            <ActionForm action={cancelPayoutRequestAction}>
              <input type="hidden" name="request_id" value={pending.id} />
              <SubmitButton variant="outline" size="sm">Batal permohonan</SubmitButton>
            </ActionForm>
          </div>
        ) : !validBank ? (
          <Alert tone="info" title="Akaun bank diperlukan">
            Lengkapkan nama bank, nombor akaun dan nama pemegang akaun dalam profil sebelum memohon.{" "}
            <Button asChild variant="link" className="h-auto p-0"><Link href="/ahli/profil">Kemas kini profil</Link></Button>
          </Alert>
        ) : outstandingSen > 0 ? (
          <ActionForm action={requestPayoutAction} className="space-y-3">
            <Input name="notes" placeholder="Catatan untuk admin (pilihan)" maxLength={500} aria-label="Catatan" />
            <SubmitButton className="w-full">Mohon pemindahan {formatRM(outstandingSen)}</SubmitButton>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted-foreground">Tiada baki komisen tertunggak untuk dipohon.</p>
        )}
        {requests.filter((r) => r.status !== "pending").length > 0 && (
          <ul className="divide-y border-t pt-2 text-sm">
            {requests.filter((r) => r.status !== "pending").slice(0, 5).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>{formatRM(r.amount_sen)} <span className="text-xs text-muted-foreground">· {formatDateTime(r.created_at)}</span></span>
                <span className="flex items-center gap-2">
                  {r.review_notes && <span className="text-xs text-muted-foreground">{r.review_notes}</span>}
                  <StatusBadge map={PAYOUT_REQUEST_STATUS} value={r.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
