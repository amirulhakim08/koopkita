import { requireAdmin } from "@/lib/auth";
import { logoutAction } from "@/features/auth/actions";
import { MfaClient } from "./mfa-client";

export const metadata = { title: "Pengesahan MFA" };

export default async function MfaPage() {
  await requireAdmin({ allowAal1: true });
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Pengesahan dua faktor</h1>
        <p className="text-sm text-muted-foreground">Akses Super Admin memerlukan MFA untuk melindungi rekod kewangan dan data ahli.</p>
      </div>
      <MfaClient />
      <form action={logoutAction}><button className="w-full text-center text-sm text-muted-foreground hover:underline">Log keluar</button></form>
    </div>
  );
}
