import { AppShell } from "@/components/app-shell/app-shell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdmin();
  return <AppShell area="admin" profile={profile}>{children}</AppShell>;
}
