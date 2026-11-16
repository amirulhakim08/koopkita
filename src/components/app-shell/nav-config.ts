export type NavItem = { href: string; label: string; icon: string; mobile?: boolean };

export const MEMBER_NAV: NavItem[] = [
  { href: "/ahli", label: "Utama", icon: "home", mobile: true },
  { href: "/ahli/korban", label: "Korban", icon: "beef", mobile: true },
  { href: "/ahli/saham", label: "Syer", icon: "coins", mobile: true },
  { href: "/ahli/komisen", label: "Komisen", icon: "wallet", mobile: true },
  { href: "/ahli/notifikasi", label: "Notifikasi", icon: "bell" },
  { href: "/ahli/profil", label: "Profil", icon: "user", mobile: true },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Papan Pemuka", icon: "dashboard", mobile: true },
  { href: "/admin/ahli", label: "Ahli", icon: "users", mobile: true },
  { href: "/admin/saham", label: "Modal Syer", icon: "coins" },
  { href: "/admin/kempen", label: "Kempen Korban", icon: "beef" },
  { href: "/admin/jualan", label: "Jualan Korban", icon: "receipt", mobile: true },
  { href: "/admin/komisen", label: "Komisen", icon: "wallet", mobile: true },
  { href: "/admin/laporan", label: "Laporan", icon: "file" },
  { href: "/admin/pengumuman", label: "Pengumuman", icon: "megaphone" },
  { href: "/admin/audit", label: "Log Audit", icon: "shield" },
  { href: "/admin/tetapan", label: "Tetapan", icon: "settings" },
];
