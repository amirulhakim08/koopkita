export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

export const MEMBER_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending_verification: { label: "Menunggu Pengesahan E-mel", tone: "warning" },
  pending_approval: { label: "Menunggu Kelulusan", tone: "warning" },
  active: { label: "Aktif", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
  suspended: { label: "Digantung", tone: "danger" },
};

export const REVIEW_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Menunggu Semakan", tone: "warning" },
  approved: { label: "Diluluskan", tone: "success" },
  verified: { label: "Disahkan", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
};

export const SALE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "neutral" },
  pending_payment: { label: "Menunggu Bayaran", tone: "warning" },
  pending_review: { label: "Menunggu Semakan", tone: "info" },
  approved: { label: "Diluluskan", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
};

export const SLOT_STATUS: Record<string, { label: string; tone: Tone }> = {
  available: { label: "Tersedia", tone: "neutral" },
  reserved: { label: "Ditempah", tone: "warning" },
  confirmed: { label: "Disahkan", tone: "success" },
  cancelled: { label: "Dibatalkan", tone: "danger" },
};

export const CAMPAIGN_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "neutral" },
  open: { label: "Dibuka", tone: "success" },
  closed: { label: "Ditutup", tone: "warning" },
  completed: { label: "Selesai", tone: "info" },
};

export const COMMISSION_TYPE: Record<string, { label: string; tone: Tone }> = {
  standard: { label: "Komisen Biasa", tone: "success" },
  full_cattle_incentive: { label: "Insentif Seekor Penuh", tone: "info" },
  reversal: { label: "Pembalikan", tone: "danger" },
  adjustment: { label: "Pelarasan", tone: "neutral" },
};

export const QURBAN_TYPE: Record<string, string> = {
  korban_sunat: "Korban Sunat",
  korban_nazar: "Korban Nazar",
  aqiqah: "Aqiqah",
};

export const MALAYSIAN_STATES = [
  "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang",
  "Sabah", "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur", "W.P. Labuan", "W.P. Putrajaya",
] as const;

export const MALAYSIAN_BANKS = [
  "Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Islam", "Bank Rakyat",
  "BSN (Bank Simpanan Nasional)", "Affin Bank", "Alliance Bank", "Agrobank", "Bank Muamalat", "MBSB Bank",
  "OCBC Bank", "UOB Malaysia", "HSBC Bank Malaysia", "Standard Chartered", "Al Rajhi Bank", "Kuwait Finance House",
] as const;

export const PAYOUT_REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Sedang Diproses", tone: "warning" },
  paid: { label: "Telah Dibayar", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
  cancelled: { label: "Dibatalkan", tone: "neutral" },
};

export const BUSINESSES: Record<string, string> = {
  umum: "Umum / Pentadbiran",
  korban: "Korban",
  pertanian: "Pertanian",
  pelancongan: "Pelancongan",
  lain_lain: "Lain-lain",
};

export const FINANCE_IN_CATEGORIES: Record<string, string> = {
  hasil_perniagaan: "Hasil perniagaan",
  sumbangan: "Sumbangan / derma",
  yuran: "Yuran",
  pinjaman_diterima: "Pinjaman diterima",
  baki_permulaan: "Baki permulaan",
  lain_lain_masuk: "Lain-lain (masuk)",
};

export const FINANCE_OUT_CATEGORIES: Record<string, string> = {
  pengeluaran_tunai: "Pengeluaran tunai",
  perbelanjaan_operasi: "Perbelanjaan operasi",
  pembelian_stok: "Pembelian stok / bahan",
  pembelian_aset: "Pembelian aset",
  gaji_elaun: "Gaji / elaun",
  sewa_utiliti: "Sewa / utiliti",
  bayaran_balik_pinjaman: "Bayaran balik pinjaman",
  pemulangan_bayaran: "Pemulangan bayaran pelanggan",
  lain_lain_keluar: "Lain-lain (keluar)",
};

/** Labels for every category in the cash book, including automatic flows. */
export const CASHBOOK_CATEGORIES: Record<string, string> = {
  ...FINANCE_IN_CATEGORIES,
  ...FINANCE_OUT_CATEGORIES,
  modal_syer: "Modal syer",
  pelarasan_modal_syer: "Pelarasan modal syer",
  bayaran_korban: "Bayaran korban",
  bayaran_komisen: "Bayaran komisen",
};

export const CASHBOOK_SOURCES: Record<string, { label: string; tone: Tone }> = {
  manual: { label: "Rekod manual", tone: "neutral" },
  modal_syer: { label: "Modal syer", tone: "info" },
  korban: { label: "Korban", tone: "success" },
  komisen: { label: "Komisen", tone: "warning" },
};

export const INVOICE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "neutral" },
  issued: { label: "Dikeluarkan", tone: "info" },
  partially_paid: { label: "Dibayar Separa", tone: "warning" },
  paid: { label: "Dibayar", tone: "success" },
  cancelled: { label: "Dibatalkan", tone: "danger" },
  overdue: { label: "Lewat Bayar", tone: "danger" },
};

export const QUOTE_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draf", tone: "neutral" },
  sent: { label: "Dihantar", tone: "info" },
  accepted: { label: "Diterima", tone: "success" },
  rejected: { label: "Ditolak", tone: "danger" },
  converted: { label: "Ditukar ke invois", tone: "success" },
  expired: { label: "Tamat tempoh", tone: "warning" },
};

export const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: "Pindahan bank",
  duitnow: "DuitNow",
  cash: "Tunai",
  card: "Kad",
  cheque: "Cek",
  other: "Lain-lain",
};
