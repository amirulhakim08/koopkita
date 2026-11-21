import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MeetingForm, type PickMember } from "@/features/meetings/meeting-form";
import type { Meeting } from "@/types/db";

export const metadata = { title: "Ubah Mesyuarat" };

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: meeting }, { data: members }, { data: inv }] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name, membership_id").eq("status", "active").order("member_no"),
    supabase.from("meeting_invitees").select("member_id").eq("meeting_id", id),
  ]);
  if (!meeting) notFound();
  const m = meeting as Meeting;
  if (m.status === "completed" || m.status === "cancelled") notFound();
  return (
    <>
      <Link href={`/admin/mesyuarat/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {m.title}</Link>
      <PageHeader title="Ubah mesyuarat" description={m.status === "draft" ? m.meeting_no : `${m.meeting_no} · peserta akan dimaklumkan tentang perubahan`} />
      <div className="max-w-3xl">
        <MeetingForm meeting={m} members={(members ?? []) as PickMember[]} selected={m.audience === "selected" ? (inv ?? []).map((r) => r.member_id) : []}
          lockAudience={m.status === "ongoing"} />
      </div>
    </>
  );
}
