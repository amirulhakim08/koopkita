import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { FileLink } from "@/components/file-link";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime, formatRM } from "@/lib/format";
import { QURBAN_TYPE, REVIEW_STATUS, SALE_STATUS } from "@/lib/labels";
import type { PaymentSubmission, QurbanSale } from "@/types/db";

export type SaleBundle = Awaited<ReturnType<typeof loadSale>>;

/** Loads a sale with RLS: members only ever get their own sales. */
export async function loadSale(id: string) {
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("qurban_sales")
    .select("*, buyers(*), campaigns(*), profiles!qurban_sales_member_id_fkey(full_name, membership_id, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!sale) return null;
  const [{ data: participants }, { data: payments }, { data: commission }] = await Promise.all([
    supabase.from("qurban_participants").select("*, cattle_slots(id, slot_no, status, cattle(code))").eq("sale_id", id).order("position"),
    supabase.from("payment_submissions").select("*").eq("sale_id", id).order("created_at"),
    supabase.from("commission_ledger").select("*").eq("sale_id", id).order("created_at"),
  ]);
  const pays = (payments ?? []) as PaymentSubmission[];
  const verified = pays.filter((p) => p.status === "verified").reduce((a, p) => a + Number(p.amount_sen), 0);
  const pending = pays.filter((p) => p.status === "pending").reduce((a, p) => a + Number(p.amount_sen), 0);
  return {
    sale: sale as QurbanSale & {
      buyers: { full_name: string; phone: string; email: string | null; address: string | null };
      campaigns: { name: string; year: number; reservation_expiry_hours: number };
      profiles: { full_name: string; membership_id: string | null; phone: string | null } | null;
    },
    participants: (participants ?? []) as Array<{
      id: string; position: number; participant_name: string; qurban_type: string; on_behalf_of: string | null; slot_code_snapshot: string | null;
      cattle_slots: { id: string; slot_no: number; status: string; cattle: { code: string } } | null;
    }>,
    payments: pays,
    commission: commission ?? [],
    verifiedSen: verified,
    pendingSen: pending,
    remainingSen: Number(sale.total_sen) - verified - pending,
  };
}

export function SaleOverview({ bundle, showMember = false }: { bundle: NonNullable<SaleBundle>; showMember?: boolean }) {
  const { sale } = bundle;
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-lg">{sale.sale_no}</CardTitle>
          <p className="text-sm text-muted-foreground">{sale.campaigns.name}</p>
        </div>
        <StatusBadge map={SALE_STATUS} value={sale.status} />
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div><dt className="text-muted-foreground">Bahagian</dt><dd className="text-lg font-bold">{sale.share_count}</dd></div>
          <div><dt className="text-muted-foreground">Jumlah</dt><dd className="text-lg font-bold">{formatRM(sale.total_sen)}</dd></div>
          <div><dt className="text-muted-foreground">Disahkan</dt><dd className="text-lg font-bold text-success">{formatRM(bundle.verifiedSen)}</dd></div>
          <div><dt className="text-muted-foreground">Baki</dt><dd className="text-lg font-bold">{formatRM(Math.max(0, Number(sale.total_sen) - bundle.verifiedSen))}</dd></div>
        </dl>
        <div className="mt-4 grid gap-4 border-t pt-4 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pembeli</p>
            <p className="font-medium">{sale.buyers.full_name}</p>
            <p>{sale.buyers.phone}{sale.buyers.email ? ` · ${sale.buyers.email}` : ""}</p>
            {sale.buyers.address && <p className="text-muted-foreground">{sale.buyers.address}</p>}
          </div>
          <div className="space-y-1">
            {showMember && sale.profiles && (
              <p><span className="text-muted-foreground">Ahli penjual: </span><strong>{sale.profiles.full_name}</strong> ({sale.profiles.membership_id})</p>
            )}
            <p><span className="text-muted-foreground">Dicipta: </span>{formatDateTime(sale.created_at)}</p>
            {sale.status === "pending_payment" && sale.reservation_expires_at && (
              <p className="text-warning"><span>Tempahan tamat: </span><strong>{formatDateTime(sale.reservation_expires_at)}</strong></p>
            )}
            {sale.reviewed_at && <p><span className="text-muted-foreground">Disemak: </span>{formatDateTime(sale.reviewed_at)}</p>}
            {sale.review_notes && <p><span className="text-muted-foreground">Catatan semakan: </span>{sale.review_notes}</p>}
            {sale.cancel_reason && <p className="text-danger">Sebab pembatalan: {sale.cancel_reason}</p>}
            {sale.notes && <p><span className="text-muted-foreground">Catatan: </span>{sale.notes}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ParticipantsTable({ bundle }: { bundle: NonNullable<SaleBundle> }) {
  return (
    <Table>
      <THead><TR><TH>#</TH><TH>Peserta</TH><TH>Jenis</TH><TH>Lembu / Slot</TH></TR></THead>
      <TBody>
        {bundle.participants.map((p) => (
          <TR key={p.id}>
            <TD>{p.position}</TD>
            <TD><p className="font-medium">{p.participant_name}</p>{p.on_behalf_of && <p className="text-xs text-muted-foreground">Bagi pihak: {p.on_behalf_of}</p>}</TD>
            <TD>{QURBAN_TYPE[p.qurban_type] ?? p.qurban_type}</TD>
            <TD>
              {p.cattle_slots ? (
                <span className="font-mono text-xs">{p.cattle_slots.cattle.code} · slot {p.cattle_slots.slot_no}</span>
              ) : (
                <span className="text-xs text-muted-foreground">Dilepaskan{p.slot_code_snapshot ? ` (asal ${p.slot_code_snapshot})` : ""}</span>
              )}
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

export function PaymentsList({ bundle, renderActions }: { bundle: NonNullable<SaleBundle>; renderActions?: (p: PaymentSubmission) => React.ReactNode }) {
  if (!bundle.payments.length) return <p className="text-sm text-muted-foreground">Belum ada bukti bayaran dihantar.</p>;
  return (
    <ul className="space-y-3">
      {bundle.payments.map((p) => (
        <li key={p.id} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{formatRM(p.amount_sen)} <span className="font-normal text-muted-foreground">· {formatDate(p.payment_date)}</span></p>
              <p className="font-mono text-xs">{p.transaction_ref}</p>
            </div>
            <div className="flex items-center gap-2">
              {p.duplicate_flag && <Badge tone="danger">Disyaki pendua</Badge>}
              <StatusBadge map={REVIEW_STATUS} value={p.status} />
            </div>
          </div>
          {p.duplicate_reason && <p className="mt-1 text-xs text-danger">{p.duplicate_reason}</p>}
          {p.review_notes && <p className="mt-1 text-xs text-muted-foreground">Catatan: {p.review_notes}</p>}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <FileLink path={p.receipt_path} />
            {renderActions?.(p)}
          </div>
        </li>
      ))}
    </ul>
  );
}
