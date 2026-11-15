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
