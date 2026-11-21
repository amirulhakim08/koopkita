import { Briefcase } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireActiveMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ProjectCard } from "@/features/projects/project-card";
import type { Project, ProjectProgress } from "@/types/db";

export const metadata = { title: "Projek" };

const ORDER: Record<string, number> = { open: 0, full: 1, active: 2, matured: 3, completed: 4, cancelled: 5 };

export default async function ProjectsPage() {
  await requireActiveMember();
  const supabase = await createClient();
  const [{ data: projects }, { data: progress }] = await Promise.all([
    supabase.from("projects").select("*").order("created_at", { ascending: false }),
    supabase.rpc("project_progress"),
  ]);
  const byId = new Map(((progress ?? []) as ProjectProgress[]).map((p) => [p.project_id, p]));
  const list = ((projects ?? []) as Project[]).sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const open = list.filter((p) => p.status === "open");
  const others = list.filter((p) => p.status !== "open");

  return (
    <>
      <PageHeader title="Projek koperasi" description="Sertai projek pelaburan koperasi. Pulangan lepas bukan jaminan pulangan masa hadapan." />
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dibuka untuk penyertaan</h2>
      {open.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {open.map((p) => <ProjectCard key={p.id} project={p} progress={byId.get(p.id)} href={`/ahli/projek/${p.id}`} joinable />)}
        </div>
      ) : <EmptyState icon={Briefcase} title="Tiada projek dibuka" description="Projek baharu akan dipaparkan di sini apabila dibuka oleh koperasi." />}
      {others.length > 0 && (
        <>
          <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Projek lain</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {others.map((p) => <ProjectCard key={p.id} project={p} progress={byId.get(p.id)} href={`/ahli/projek/${p.id}`} />)}
          </div>
        </>
      )}
    </>
  );
}
