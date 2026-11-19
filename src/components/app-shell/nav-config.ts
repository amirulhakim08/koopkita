export type NavItem = {
  href: string; label: string; icon: string; mobile?: boolean;
  /** shorter label for the phone bottom bar */ mobileLabel?: string;
  /** position in the phone bottom bar (default: menu order) */ mobileOrder?: number;
};

export const MEMBER_NAV: NavItem[] = [
  { href: "/ahli", label: "Utama", icon: "home", mobile: true },
  { href: "/ahli/korban", label: "Korban", icon: "beef", mobile: true },
  { href: "/ahli/saham", label: "Syer", icon: "coins", mobile: true, mobileOrder: 4 },
  { href: "/ahli/komisen", label: "Komisen", icon: "wallet", mobile: true },
  { href: "/ahli/bisnes", label: "Bisnes Saya", icon: "store", mobile: true, mobileLabel: "Bisnes", mobileOrder: 2 },
  { href: "/ahli/notifikasi", label: "Notifikasi", icon: "bell" },
  { href: "/ahli/profil", label: "Profil", icon: "user" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Papan Pemuka", icon: "dashboard", mobile: true },
  { href: "/admin/ahli", label: "Ahli", icon: "users", mobile: true },
  { href: "/admin/saham", label: "Modal Syer", icon: "coins" },
  { href: "/admin/kempen", label: "Kempen Korban", icon: "beef" },
  { href: "/admin/jualan", label: "Jualan Korban", icon: "receipt", mobile: true },
  { href: "/admin/komisen", label: "Komisen", icon: "wallet", mobile: true },
  { href: "/admin/kewangan", label: "Kewangan", icon: "landmark" },
  { href: "/admin/bisnes", label: "Bisnes Ahli", icon: "store" },
  { href: "/admin/laporan", label: "Laporan", icon: "file" },
  { href: "/admin/pengumuman", label: "Notifikasi Ahli", icon: "megaphone" },
  { href: "/admin/audit", label: "Log Audit", icon: "shield" },
  { href: "/admin/tetapan", label: "Tetapan", icon: "settings" },
];
