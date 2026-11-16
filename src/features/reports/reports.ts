import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateTime, maskIc, senToDecimal } from "@/lib/format";
import { COMMISSION_TYPE, MEMBER_STATUS, QURBAN_TYPE, REVIEW_STATUS, SALE_STATUS, SLOT_STATUS, CAMPAIGN_STATUS } from "@/lib/labels";

type Cell = string | number | null | undefined;
export type Report = { title: string; description: string; build: (sb: SupabaseClient, params: URLSearchParams) => Promise<{ headers: string[]; rows: Cell[][] }> };

const label = (m: Record<string, { label: string }>, v: string) => m[v]?.label ?? v;
type Rel<T> = T | null;

export const REPORTS: Record<string, Report> = {
  ahli: {
    title: "Senarai ahli",
    description: "Semua ahli dengan status keahlian dan maklumat hubungan (No. KP disamarkan).",
    async build(sb) {
      const { data } = await sb.from("profiles").select("*").order("member_no", { ascending: true, nullsFirst: false });
      return {
        headers: ["No. Ahli", "Nama", "E-mel", "Telefon", "No. KP", "Negeri", "Poskod", "Status", "Tarikh Daftar", "Tarikh Lulus"],
        rows: (data ?? []).map((p) => [p.membership_id, p.full_name, p.email, p.phone, maskIc(p.ic_number), p.state, p.postcode,
          label(MEMBER_STATUS, p.status), formatDate(p.created_at), formatDate(p.approved_at)]),
      };
    },
  },
  saham: {
    title: "Laporan modal syer",
    description: "Baki modal syer diluluskan dan menunggu bagi setiap ahli.",
    async build(sb) {
      const { data } = await sb.from("v_share_balances").select("*").order("membership_id");
      return {
        headers: ["No. Ahli", "Nama", "Modal Diluluskan (RM)", "Menunggu (RM)", "Bil. Menunggu"],
        rows: (data ?? []).map((b) => [b.membership_id, b.full_name, senToDecimal(b.approved_sen), senToDecimal(b.pending_sen), b.pending_count]),
      };
    },
  },
  "transaksi-saham": {
    title: "Sejarah bayaran syer",
    description: "Semua bayaran dan pelarasan modal syer.",
    async build(sb) {
      const { data } = await sb.from("share_transactions").select("*, profiles!share_transactions_member_id_fkey(full_name, membership_id)").order("created_at");
      return {
        headers: ["Tarikh Rekod", "No. Ahli", "Nama", "Jenis", "Tarikh Bayar", "Rujukan", "Jumlah (RM)", "Status", "Pendua?", "Sebab/Catatan"],
        rows: (data ?? []).map((t) => [formatDateTime(t.created_at), t.profiles?.membership_id, t.profiles?.full_name, t.txn_type === "payment" ? "Bayaran" : "Pelarasan",
          formatDate(t.payment_date), t.transaction_ref, senToDecimal(t.amount_sen), label(REVIEW_STATUS, t.status), t.duplicate_flag ? "Ya" : "", t.reason ?? t.review_notes]),
      };
    },
  },
  kempen: {
    title: "Laporan kempen korban",
    description: "Ringkasan setiap kempen: lembu, slot dan hasil jualan diluluskan.",
    async build(sb) {
      const [{ data: c }, { data: sales }] = await Promise.all([
        sb.from("v_campaign_progress").select("*").order("year"),
        sb.from("qurban_sales").select("campaign_id, total_sen, share_count").eq("status", "approved"),
      ]);
      const rev = new Map<string, number>();
      for (const s of sales ?? []) rev.set(s.campaign_id, (rev.get(s.campaign_id) ?? 0) + Number(s.total_sen));
      return {
        headers: ["Kempen", "Tahun", "Status", "Lembu", "Jumlah Slot", "Disahkan", "Ditempah", "Tersedia", "Dibatalkan", "Hasil Diluluskan (RM)"],
        rows: (c ?? []).map((x) => [x.name, x.year, label(CAMPAIGN_STATUS, x.status), x.cattle_count, x.total_slots, x.confirmed_slots, x.reserved_slots,
          x.available_slots, x.cancelled_slots, senToDecimal(rev.get(x.campaign_id) ?? 0)]),
      };
    },
  },
  "peruntukan-lembu": {
    title: "Laporan peruntukan lembu",
    description: "Setiap slot lembu dengan jualan, peserta dan ahli penjual.",
    async build(sb, params) {
      let q = sb.from("cattle_slots")
        .select("slot_no, status, cattle!inner(code, seq, campaign_id, campaigns(name)), qurban_sales!cattle_slots_sale_id_fkey(sale_no, profiles!qurban_sales_member_id_fkey(full_name, membership_id)), qurban_participants(participant_name, qurban_type, on_behalf_of)")
        .order("slot_no");
      const k = params.get("kempen");
      if (k && /^[0-9a-f-]{36}$/.test(k)) q = q.eq("cattle.campaign_id", k);
      const { data } = await q.limit(10000);
      const rows = (data ?? []).map((s) => {
        const cattle = s.cattle as unknown as { code: string; seq: number; campaigns: Rel<{ name: string }> };
        const sale = s.qurban_sales as unknown as Rel<{ sale_no: string; profiles: Rel<{ full_name: string; membership_id: string }> }>;
        const p = (s.qurban_participants as unknown as { participant_name: string; qurban_type: string; on_behalf_of: string | null }[])?.[0];
        return { key: `${cattle.code}-${String(s.slot_no).padStart(2, "0")}`, row: [cattle.campaigns?.name, cattle.code, s.slot_no, label(SLOT_STATUS, s.status), sale?.sale_no,
          p?.participant_name, p ? QURBAN_TYPE[p.qurban_type] : "", p?.on_behalf_of, sale?.profiles?.full_name, sale?.profiles?.membership_id] as Cell[] };
      }).sort((a, b) => a.key.localeCompare(b.key));
      return { headers: ["Kempen", "ID Lembu", "Slot", "Status", "No. Jualan", "Peserta", "Jenis", "Bagi Pihak", "Ahli Penjual", "No. Ahli"], rows: rows.map((r) => r.row) };
    },
  },
  pembeli: {
    title: "Laporan pembeli & peserta",
    description: "Pembeli dan peserta korban bagi setiap jualan (data peribadi — kendalikan dengan berhati-hati).",
    async build(sb) {
      const { data } = await sb.from("qurban_participants")
        .select("position, participant_name, qurban_type, on_behalf_of, slot_code_snapshot, cattle_slots(slot_no, cattle(code)), qurban_sales!inner(sale_no, status, buyers(full_name, phone, email), campaigns(name), profiles!qurban_sales_member_id_fkey(full_name))")
        .order("created_at");
      return {
        headers: ["Kempen", "No. Jualan", "Status Jualan", "Pembeli", "Telefon Pembeli", "E-mel Pembeli", "Peserta", "Jenis", "Bagi Pihak", "Lembu/Slot", "Ahli Penjual"],
        rows: (data ?? []).map((p) => {
          const s = p.qurban_sales as unknown as { sale_no: string; status: string; buyers: Rel<{ full_name: string; phone: string; email: string | null }>; campaigns: Rel<{ name: string }>; profiles: Rel<{ full_name: string }> };
          const slot = p.cattle_slots as unknown as Rel<{ slot_no: number; cattle: { code: string } }>;
          return [s.campaigns?.name, s.sale_no, label(SALE_STATUS, s.status), s.buyers?.full_name, s.buyers?.phone, s.buyers?.email, p.participant_name,
            QURBAN_TYPE[p.qurban_type], p.on_behalf_of, slot ? `${slot.cattle.code}/${slot.slot_no}` : p.slot_code_snapshot, s.profiles?.full_name];
        }),
      };
    },
  },
  jualan: {
    title: "Laporan jualan",
    description: "Semua jualan korban dengan ahli, pembeli, jumlah dan status.",
    async build(sb) {
      const { data } = await sb.from("qurban_sales")
        .select("*, campaigns(name), buyers(full_name, phone), profiles!qurban_sales_member_id_fkey(full_name, membership_id)")
        .order("created_at");
      return {
        headers: ["No. Jualan", "Kempen", "No. Ahli", "Ahli", "Pembeli", "Telefon", "Bahagian", "Harga Sebahagian (RM)", "Jumlah (RM)", "Status", "Tarikh", "Tarikh Semakan"],
        rows: (data ?? []).map((s) => [s.sale_no, s.campaigns?.name, s.profiles?.membership_id, s.profiles?.full_name, s.buyers?.full_name, s.buyers?.phone,
          s.share_count, senToDecimal(s.price_per_share_sen), senToDecimal(s.total_sen), label(SALE_STATUS, s.status), formatDate(s.created_at), formatDate(s.reviewed_at)]),
      };
    },
  },
  "jualan-ahli": {
    title: "Jualan mengikut ahli",
    description: "Jumlah bahagian dan nilai jualan diluluskan bagi setiap ahli.",
    async build(sb) {
      const { data } = await sb.from("qurban_sales").select("share_count, total_sen, profiles!qurban_sales_member_id_fkey(full_name, membership_id)").eq("status", "approved");
      const agg = new Map<string, { name: string; id: string; shares: number; sales: number; total: number }>();
      for (const s of data ?? []) {
        const p = s.profiles as unknown as { full_name: string; membership_id: string };
        const a = agg.get(p.membership_id) ?? { name: p.full_name, id: p.membership_id, shares: 0, sales: 0, total: 0 };
        a.shares += s.share_count; a.sales += 1; a.total += Number(s.total_sen);
        agg.set(p.membership_id, a);
      }
      return {
        headers: ["No. Ahli", "Nama", "Bil. Jualan", "Bahagian", "Nilai Jualan (RM)"],
        rows: [...agg.values()].sort((a, b) => b.shares - a.shares).map((a) => [a.id, a.name, a.sales, a.shares, senToDecimal(a.total)]),
      };
    },
  },
  komisen: {
    title: "Laporan komisen",
    description: "Lejar komisen lengkap termasuk insentif seekor penuh dan pembalikan.",
    async build(sb) {
      const { data } = await sb.from("commission_ledger").select("*, profiles!commission_ledger_member_id_fkey(full_name, membership_id), qurban_sales(sale_no)").order("created_at");
      return {
        headers: ["Tarikh", "No. Ahli", "Ahli", "Jenis", "No. Jualan", "Bahagian", "Jumlah (RM)", "Keterangan"],
        rows: (data ?? []).map((e) => [formatDateTime(e.created_at), e.profiles?.membership_id, e.profiles?.full_name, label(COMMISSION_TYPE, e.entry_type),
          e.qurban_sales?.sale_no, e.share_count, senToDecimal(e.amount_sen), e.description]),
      };
    },
  },
  "bayaran-komisen": {
    title: "Laporan bayaran komisen",
    description: "Semua bayaran komisen yang direkodkan (termasuk pembalikan).",
    async build(sb) {
      const { data } = await sb.from("commission_payouts").select("*, member:profiles!commission_payouts_member_id_fkey(full_name, membership_id)").order("created_at");
      return {
        headers: ["No. Bayaran", "No. Ahli", "Ahli", "Tarikh Pindahan", "Rujukan Bank", "Jumlah (RM)", "Pembalikan?", "Catatan", "Direkod"],
        rows: (data ?? []).map((p) => [p.payout_no, p.member?.membership_id, p.member?.full_name, formatDate(p.payment_date), p.transaction_ref,
          senToDecimal(p.amount_sen), p.reverses_id ? "Ya" : "", p.notes, formatDateTime(p.created_at)]),
      };
    },
  },
  tertunggak: {
    title: "Bayaran tertunggak",
    description: "Jualan yang belum dibayar penuh oleh pelanggan, dan komisen ahli yang belum dibayar.",
    async build(sb) {
      const [{ data: sales }, { data: pays }, { data: comm }] = await Promise.all([
        sb.from("qurban_sales").select("id, sale_no, total_sen, status, reservation_expires_at, profiles!qurban_sales_member_id_fkey(full_name, membership_id), buyers(full_name, phone)").in("status", ["pending_payment", "pending_review"]),
        sb.from("payment_submissions").select("sale_id, amount_sen, status").eq("status", "verified"),
        sb.from("v_commission_summary").select("*").gt("outstanding_sen", 0),
      ]);
      const verified = new Map<string, number>();
      for (const p of pays ?? []) verified.set(p.sale_id, (verified.get(p.sale_id) ?? 0) + Number(p.amount_sen));
      const rows: Cell[][] = (sales ?? []).map((s) => {
        const m = s.profiles as unknown as { full_name: string; membership_id: string };
        const b = s.buyers as unknown as { full_name: string; phone: string };
        const v = verified.get(s.id) ?? 0;
        return ["Bayaran pelanggan", s.sale_no, m?.membership_id, m?.full_name, `${b?.full_name} (${b?.phone})`, senToDecimal(s.total_sen), senToDecimal(v),
          senToDecimal(Number(s.total_sen) - v), `${label(SALE_STATUS, s.status)}${s.reservation_expires_at ? ` · tamat ${formatDateTime(s.reservation_expires_at)}` : ""}`];
      });
      for (const c of comm ?? []) rows.push(["Komisen ahli", "", c.membership_id, c.full_name, "", senToDecimal(c.earned_sen), senToDecimal(c.paid_sen), senToDecimal(c.outstanding_sen), ""]);
      return { headers: ["Kategori", "No. Jualan", "No. Ahli", "Ahli", "Pembeli", "Jumlah (RM)", "Diterima/Dibayar (RM)", "Baki (RM)", "Status"], rows };
    },
  },
};
