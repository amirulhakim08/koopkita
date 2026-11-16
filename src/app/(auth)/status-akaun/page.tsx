import { redirect } from "next/navigation";
import { Clock, MailWarning, ShieldX, Ban } from "lucide-react";
import { requireSession, homeFor } from "@/lib/auth";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Status Akaun" };

const content = {
  pending_verification: { icon: MailWarning, title: "Sahkan e-mel anda", body: "Sila klik pautan pengesahan yang dihantar ke e-mel anda untuk meneruskan permohonan." },
  pending_approval: { icon: Clock, title: "Permohonan sedang disemak", body: "E-mel anda telah disahkan. Permohonan keahlian anda sedang menunggu kelulusan Super Admin. Anda akan dimaklumkan selepas disemak." },
  rejected: { icon: ShieldX, title: "Permohonan tidak diluluskan", body: "Permohonan keahlian anda tidak diluluskan. Sila hubungi pejabat koperasi untuk maklumat lanjut." },
  suspended: { icon: Ban, title: "Akaun digantung", body: "Akses akaun anda telah digantung. Sila hubungi pejabat koperasi." },
} as const;

export default async function AccountStatusPage() {
  const session = await requireSession();
  const p = session.profile;
  if (p?.status === "active") redirect(homeFor(p));
  const c = content[(p?.status ?? "pending_verification") as keyof typeof content];
  const Icon = c.icon;
  return (
    <div className="space-y-5 text-center">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-secondary text-primary">
        <Icon className="size-7" />
      </span>
      <h1 className="text-2xl font-bold">{c.title}</h1>
      <p className="text-sm text-muted-foreground">{c.body}</p>
      {p?.status_reason && (p.status === "rejected" || p.status === "suspended") && (
        <p className="rounded-lg bg-muted p-3 text-sm">Sebab: {p.status_reason}</p>
      )}
      {p && <p className="text-xs text-muted-foreground">Didaftarkan pada {formatDateTime(p.created_at)} · {p.email}</p>}
      <form action={logoutAction}>
        <Button variant="outline" className="w-full">Log keluar</Button>
      </form>
    </div>
  );
}
