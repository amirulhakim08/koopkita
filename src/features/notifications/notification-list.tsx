import Link from "next/link";
import { Bell } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { markAllReadAction } from "@/features/notifications/actions";
import type { Notification } from "@/types/db";

export async function NotificationList() {
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(100);
  const items = (data ?? []) as Notification[];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <div className="space-y-4">
      {unread > 0 && (
        <form action={markAllReadAction}>
          <Button variant="outline" size="sm">Tandakan semua telah dibaca ({unread})</Button>
        </form>
      )}
      {items.length ? (
        <ul className="divide-y rounded-xl border bg-white">
          {items.map((n) => {
            const body = (
              <div className="flex gap-3 p-4">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-border" : "bg-primary"}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}</p>
                  {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-muted/40">{body}</Link> : body}</li>;
          })}
        </ul>
      ) : <EmptyState icon={Bell} title="Tiada notifikasi" />}
    </div>
  );
}
