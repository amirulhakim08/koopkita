import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireAdmin } from "@/lib/auth";
import { ProjectForm } from "@/features/projects/project-form";

export const metadata = { title: "Projek Baharu" };

export default async function NewProjectPage() {
  const { userId } = await requireAdmin();
  return (
    <>
      <Link href="/admin/projek" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Pengurusan Projek</Link>
      <PageHeader title="Projek Baharu" description="Projek disimpan sebagai draf. Ahli hanya melihat projek selepas diterbitkan." />
      <div className="max-w-3xl"><ProjectForm adminId={userId} /></div>
    </>
  );
}
