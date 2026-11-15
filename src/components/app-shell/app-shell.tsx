import Link from "next/link";
import { Bell, Leaf, LogOut } from "lucide-react";
import { logoutAction } from "@/features/auth/actions";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/db";
import { ADMIN_NAV, MEMBER_NAV } from "./nav-config";
import { BottomNav, MobileMenu, SidebarNav } from "./nav-links";

export async function AppShell({ area, profile, children }: { area: "admin" | "member"; profile: Profile; children: React.ReactNode }) {
  const items = area === "admin" ? ADMIN_NAV : MEMBER_NAV;
  const root = area === "admin" ? "/admin" : "/ahli";
  const supabase = await createClient();
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
  const unread = count ?? 0;
  const notifHref = area === "admin" ? "/admin/notifikasi" : "/ahli/notifikasi";

  const userBlock = (
    <div className="space-y-3 border-t pt-4">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-semibold">{profile.full_name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {profile.membership_id ?? "-"} · {profile.role === "super_admin" ? "Super Admin" : "Ahli"}
        </p>
      </div>
      {profile.role === "super_admin" && (
        <Link href={area === "admin" ? "/ahli" : "/admin"} className="block px-1 text-xs font-semibold text-primary hover:underline">
          {area === "admin" ? "→ Paparan ahli" : "→ Panel Super Admin"}
        </Link>
      )}
      <form action={logoutAction}>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground/75 hover:bg-muted">
          <LogOut className="size-4" /> Log keluar
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-dvh bg-muted/40">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col gap-6 border-r bg-white p-4 lg:flex">
        <Link href={root} className="flex items-center gap-2 px-2 pt-1 text-lg font-bold text-primary">
          <span className="rounded-lg bg-primary p-1.5 text-primary-foreground"><Leaf className="size-4" /></span>
          KoopKITA
          {area === "admin" && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide">Admin</span>}
        </Link>
        <div className="flex-1 overflow-y-auto"><SidebarNav items={items} root={root} /></div>
        {userBlock}
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-white/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileMenu items={items} root={root} footer={userBlock} />
            <span className="font-bold text-primary lg:hidden">KoopKITA</span>
            <span className="hidden text-sm text-muted-foreground lg:block">Koperasi Industri Tani Agro Pelancongan Kedah Berhad</span>
          </div>
          <Link href={notifHref} className="relative rounded-lg p-2 hover:bg-muted" aria-label={`Notifikasi (${unread} belum dibaca)`}>
            <Bell className="size-5" />
            {unread > 0 && (
              <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>
      <BottomNav items={items} root={root} />
    </div>
  );
}
