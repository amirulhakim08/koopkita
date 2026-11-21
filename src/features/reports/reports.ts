import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDate, formatDateTime, maskIc, senToDecimal } from "@/lib/format";
import { BUSINESSES, CASHBOOK_CATEGORIES, CASHBOOK_SOURCES, DECLARATION_STATUS, MEMBER_STATUS, PROJECT_STATUS, REVIEW_STATUS, WITHDRAWAL_STATUS } from "@/lib/labels";

type Cell = string | number | null | undefined;
export type Report = { title: string; description: string; build: (sb: SupabaseClient, params: URLSearchParams) => Promise<{ headers: string[]; rows: Cell[][] }> };

const label = (m: Record<string, { label: string }>, v: string) => m[v]?.label ?? v;

export const REPORTS: Record<string, Report> = {
  "bisnes-ahli": {
    title: "Jualan bisnes ahli",
    description: "Jualan setiap bisnes ahli (invois + jualan langsung), wang diterima dan baki belum dibayar. Tiada butiran pelanggan atau item. Parameter: ?dari=YYYY-MM-DD&hingga=YYYY-MM-DD",
    async build(sb, params) {
      const d = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(params.get(k) ?? "") ? params.get(k) : null);
      const { data } = await sb.rpc("admin_business_report", { p_from: d("dari"), p_to: d("hingga") });
      const rows = (data ?? []) as { name: string; ssm_no: string | null; ssm_verified: boolean; owner_name: string; membership_id: string | null;
        suspended: boolean; invoice_count: number; invoiced_sen: number; direct_count: number; direct_sales_sen: number; total_sales_sen: number;
        received_sen: number; outstanding_sen: number }[];
      return {
        headers: ["Bisnes", "No. SSM", "SSM Disahkan?", "Ahli", "No. Ahli", "Digantung?", "Bil. Invois", "Jualan Invois (RM)", "Bil. Jualan Langsung",
          "Jualan Langsung (RM)", "Jumlah Jualan (RM)", "Diterima (RM)", "Belum Dibayar Kini (RM)"],
        rows: rows.map((r) => [r.name, r.ssm_no, r.ssm_verified ? "Ya" : "Tidak", r.owner_name, r.membership_id, r.suspended ? "Ya" : "",
          Number(r.invoice_count), senToDecimal(r.invoiced_sen), Number(r.direct_count), senToDecimal(r.direct_sales_sen),
          senToDecimal(r.total_sales_sen), senToDecimal(r.received_sen), senToDecimal(r.outstanding_sen)]),
      };
    },
  },
  "buku-tunai": {
    title: "Buku tunai koperasi",
    description: "Semua wang masuk dan keluar: modal syer, projek dan rekod manual (pengeluaran, perbelanjaan, perniagaan lain). Parameter: ?dari=YYYY-MM-DD&hingga=YYYY-MM-DD",
    async build(sb, params) {
      const d = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(params.get(k) ?? "") ? params.get(k) : null);
      const { data } = await sb.rpc("admin_cashbook", { p_from: d("dari"), p_to: d("hingga"), p_limit: 10000 });
      const rows = ((data ?? []) as { entry_date: string; entry_no: string | null; source: string; category: string; business: string;
        description: string; reference: string | null; amount_sen: number; reversed: boolean }[]).reverse();
      return {
        headers: ["Tarikh", "No. Rekod", "Sumber", "Kategori", "Perniagaan", "Keterangan / Sebab", "Rujukan", "Masuk (RM)", "Keluar (RM)", "Dibalikkan?"],
        rows: rows.map((r) => [formatDate(r.entry_date), r.entry_no, CASHBOOK_SOURCES[r.source]?.label ?? r.source,
          CASHBOOK_CATEGORIES[r.category] ?? r.category, BUSINESSES[r.business] ?? r.business, r.description, r.reference,
          r.amount_sen > 0 ? senToDecimal(r.amount_sen) : "", r.amount_sen < 0 ? senToDecimal(-r.amount_sen) : "", r.reversed ? "Ya" : ""]),
      };
    },
  },
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
  projek: {
    title: "Laporan projek",
    description: "Setiap projek: sasaran, modal terkumpul, pelaburan, keuntungan, bahagian koperasi, dividen ahli dan pemulangan modal.",
    async build(sb) {
      const [{ data: projects }, { data: progress }, { data: decls }, { data: wds }, { data: returns }] = await Promise.all([
        sb.from("projects").select("*").order("created_at"),
        sb.rpc("project_progress"),
        sb.from("project_profit_declarations").select("project_id, status, gross_sen, fee_sen, member_total_sen, coop_total_sen"),
        sb.from("project_withdrawals").select("project_id, amount_sen").eq("status", "paid"),
        sb.from("project_capital_returns").select("project_id, amount_sen, reverses_id"),
      ]);
      const prog = new Map(((progress ?? []) as { project_id: string; approved_sen: number; participants: number }[]).map((x) => [x.project_id, x]));
      const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
      const profit = new Map<string, number>(), member = new Map<string, number>(), coop = new Map<string, number>(), paid = new Map<string, number>(), back = new Map<string, number>();
      for (const d of decls ?? []) if (d.status === "received") { add(profit, d.project_id, Number(d.gross_sen) - Number(d.fee_sen)); add(member, d.project_id, Number(d.member_total_sen)); add(coop, d.project_id, Number(d.coop_total_sen)); }
      for (const w of wds ?? []) add(paid, w.project_id, Number(w.amount_sen));
      for (const r of returns ?? []) add(back, r.project_id, r.reverses_id ? -Number(r.amount_sen) : Number(r.amount_sen));
      return {
        headers: ["Kod", "Projek", "Organisasi", "Status", "Sasaran (RM)", "Minimum (RM)", "Gandaan (RM)", "Modal Diluluskan (RM)", "Peserta",
          "Dilaburkan (RM)", "Tarikh Labur", "Keuntungan Diterima (RM)", "Bahagian Koperasi (RM)", "Dividen Ahli (RM)", "Dividen Dibayar (RM)",
          "Modal Diterima Semula (RM)", "Modal Dipulangkan (RM)"],
        rows: (projects ?? []).map((p) => [p.code, p.name, p.partner, label(PROJECT_STATUS, p.status), senToDecimal(p.target_sen), senToDecimal(p.min_sen),
          senToDecimal(p.step_sen), senToDecimal(prog.get(p.id)?.approved_sen ?? 0), Number(prog.get(p.id)?.participants ?? 0),
          p.invested_sen == null ? "" : senToDecimal(p.invested_sen), formatDate(p.invested_on), senToDecimal(profit.get(p.id) ?? 0),
          senToDecimal(coop.get(p.id) ?? 0), senToDecimal(member.get(p.id) ?? 0), senToDecimal(paid.get(p.id) ?? 0),
          p.capital_received_sen == null ? "" : senToDecimal(p.capital_received_sen), senToDecimal(back.get(p.id) ?? 0)]),
      };
    },
  },
  "penyertaan-projek": {
    title: "Penyertaan projek",
    description: "Setiap bayaran penyertaan ahli dengan status semakan dan versi terma yang dipersetujui.",
    async build(sb) {
      const { data } = await sb.from("project_participations")
        .select("*, project:projects(code, name), member:profiles!project_participations_member_id_fkey(full_name, membership_id)").order("created_at");
      return {
        headers: ["Dihantar", "Kod Projek", "Projek", "No. Ahli", "Ahli", "Jumlah (RM)", "Tarikh Bayar", "Rujukan Bank", "Versi Terma", "Disyaki Pendua", "Status", "Disemak", "Catatan"],
        rows: (data ?? []).map((x) => [formatDateTime(x.created_at), x.project?.code, x.project?.name, x.member?.membership_id, x.member?.full_name,
          senToDecimal(x.amount_sen), formatDate(x.payment_date), x.transaction_ref, x.terms_version, x.duplicate_flag ? "Ya" : "",
          label(REVIEW_STATUS, x.status), formatDateTime(x.reviewed_at), x.review_notes]),
      };
    },
  },
  "dividen-projek": {
    title: "Agihan dividen projek",
    description: "Agihan keuntungan setiap ahli bagi setiap pengumuman: modal, kadar, dividen ahli dan bahagian koperasi.",
    async build(sb) {
      const { data } = await sb.from("project_profit_allocations")
        .select("*, project:projects(code, name), member:profiles!project_profit_allocations_member_id_fkey(full_name, membership_id), declaration:project_profit_declarations(period_label, rate_bp, coop_rate_bp, status, received_on)")
        .order("created_at");
      return {
        headers: ["Kod Projek", "Projek", "Tempoh", "Status Pengumuman", "Tarikh Wang Diterima", "No. Ahli", "Ahli", "Modal (RM)", "Kadar Diumumkan (%)",
          "Bahagian Koperasi (mata %)", "Dividen Ahli (RM)", "Bahagian Koperasi (RM)"],
        rows: (data ?? []).map((a) => [a.project?.code, a.project?.name, a.declaration?.period_label, label(DECLARATION_STATUS, a.declaration?.status ?? ""),
          formatDate(a.declaration?.received_on), a.member?.membership_id, a.member?.full_name, senToDecimal(a.capital_sen),
          (Number(a.declaration?.rate_bp ?? 0) / 100).toFixed(2), (Number(a.declaration?.coop_rate_bp ?? 0) / 100).toFixed(2),
          senToDecimal(a.amount_sen), senToDecimal(a.coop_sen)]),
      };
    },
  },
  "pengeluaran-dividen": {
    title: "Pengeluaran dividen",
    description: "Semua permohonan pengeluaran dividen dengan akaun bank, status dan rujukan pindahan.",
    async build(sb) {
      const { data } = await sb.from("project_withdrawals")
        .select("*, project:projects(code, name), member:profiles!project_withdrawals_member_id_fkey(full_name, membership_id)").order("created_at");
      return {
        headers: ["No.", "Dipohon", "Kod Projek", "Projek", "No. Ahli", "Ahli", "Jumlah (RM)", "Bank", "No. Akaun", "Pemegang Akaun", "Status", "Tarikh Bayar", "Rujukan Pindahan", "Catatan"],
        rows: (data ?? []).map((w) => [w.withdrawal_no, formatDateTime(w.created_at), w.project?.code, w.project?.name, w.member?.membership_id, w.member?.full_name,
          senToDecimal(w.amount_sen), w.bank_name, w.bank_account_no, w.bank_account_holder, label(WITHDRAWAL_STATUS, w.status), formatDate(w.paid_on),
          w.transaction_ref, w.review_notes]),
      };
    },
  },
};
