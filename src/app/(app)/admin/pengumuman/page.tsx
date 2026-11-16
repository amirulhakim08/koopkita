import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AnnouncementForm } from "@/features/notifications/announcement-form";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Notifikasi Ahli" };

type Sent = { id: number; created_at: string; details: { title?: string; body?: string; target?: string; recipients?: number }; profiles: { full_name: string } | null };

export default async function AnnouncementPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: members }, { data: history }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, membership_id, state").eq("status", "active").order("full_name"),
    supabase.from("audit_logs").select("id, created_at, details, profiles(full_name)").eq("action", "announcement.sent").order("created_at", { ascending: false }).limit(20),
  ]);
  return (
    <>
      <PageHeader title="Notifikasi ahli" description="Hantar notifikasi dalam aplikasi kepada semua ahli aktif atau ahli yang dipilih." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader><CardTitle>Notifikasi baharu</CardTitle><CardDescription>Contoh: pembukaan kempen korban, tarikh penyembelihan, mesyuarat agung, peringatan bayaran.</CardDescription></CardHeader>
          <CardContent><AnnouncementForm members={members ?? []} /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Sejarah dihantar</CardTitle></CardHeader>
          <CardContent>
            {history?.length ? (
              <ul className="divide-y text-sm">
                {(history as unknown as Sent[]).map((h) => (
                  <li key={h.id} className="space-y-1 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{h.details.title}</p>
                      <Badge tone={h.details.target === "selected" ? "info" : "success"}>
                        {h.details.target === "selected" ? `${h.details.recipients} ahli dipilih` : `Semua (${h.details.recipients})`}
                      </Badge>
                    </div>
                    {h.details.body && <p className="line-clamp-2 text-xs text-muted-foreground">{h.details.body}</p>}
                    <p className="text-[11px] text-muted-foreground">{formatDateTime(h.created_at)} · {h.profiles?.full_name ?? "Sistem"}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Belum ada notifikasi dihantar.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
