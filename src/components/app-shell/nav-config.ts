export type NavItem = {
  href: string; label: string; icon: string; mobile?: boolean;
  /** shorter label for the phone bottom bar */ mobileLabel?: string;
  /** position in the phone bottom bar (default: menu order) */ mobileOrder?: number;
};

export const MEMBER_NAV: NavItem[] = [
  { href: "/ahli", label: "Utama", icon: "home", mobile: true },
  { href: "/ahli/projek", label: "Projek", icon: "briefcase", mobile: true },
  { href: "/ahli/bisnes", label: "Bisnes Saya", icon: "store", mobile: true, mobileLabel: "Bisnes" },
  { href: "/ahli/wallet", label: "Wallet", icon: "wallet", mobile: true },
  { href: "/ahli/saham", label: "Syer", icon: "coins", mobile: true },
  { href: "/ahli/mesyuarat", label: "Mesyuarat", icon: "calendar" },
  { href: "/ahli/notifikasi", label: "Notifikasi", icon: "bell" },
  { href: "/ahli/profil", label: "Profil", icon: "user" },
];

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Papan Pemuka", icon: "dashboard", mobile: true },
  { href: "/admin/ahli", label: "Ahli", icon: "users", mobile: true },
  { href: "/admin/saham", label: "Modal Syer", icon: "coins" },
  { href: "/admin/projek", label: "Projek", icon: "briefcase", mobile: true },
  { href: "/admin/kewangan", label: "Kewangan", icon: "landmark", mobile: true },
  { href: "/admin/mesyuarat", label: "Mesyuarat", icon: "calendar", mobile: true },
  { href: "/admin/bisnes", label: "Bisnes Ahli", icon: "store" },
  { href: "/admin/laporan", label: "Laporan", icon: "file" },
  { href: "/admin/pengumuman", label: "Notifikasi Ahli", icon: "megaphone" },
  { href: "/admin/audit", label: "Log Audit", icon: "shield" },
  { href: "/admin/tetapan", label: "Tetapan", icon: "settings" },
];
