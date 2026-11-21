import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MeetingForm, type PickMember } from "@/features/meetings/meeting-form";

export const metadata = { title: "Mesyuarat Baharu" };

export default async function NewMeetingPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, full_name, membership_id").eq("status", "active").order("member_no");
  return (
    <>
      <Link href="/admin/mesyuarat" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Mesyuarat</Link>
      <PageHeader title="Mesyuarat Baharu" description="Disimpan sebagai draf. Peserta hanya dimaklumkan selepas diterbitkan." />
      <div className="max-w-3xl"><MeetingForm members={(data ?? []) as PickMember[]} /></div>
    </>
  );
}
