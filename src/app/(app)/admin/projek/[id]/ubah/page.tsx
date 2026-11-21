import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectForm } from "@/features/projects/project-form";
import type { Project } from "@/types/db";

export const metadata = { title: "Ubah Projek" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await requireAdmin();
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  return (
    <>
      <Link href={`/admin/projek/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> {p.name}</Link>
      <PageHeader title="Ubah projek" description={`${p.code}`} />
      <div className="max-w-3xl"><ProjectForm project={p} adminId={userId} /></div>
    </>
  );
}
