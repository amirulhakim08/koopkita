import { AppShell } from "@/components/app-shell/app-shell";
import { requireActiveMember } from "@/lib/auth";

export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireActiveMember();
  return <AppShell area="member" profile={profile}>{children}</AppShell>;
}
