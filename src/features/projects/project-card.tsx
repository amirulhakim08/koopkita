import Link from "next/link";
import { Briefcase } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { formatRM } from "@/lib/format";
import { PROJECT_CATEGORY, PROJECT_STATUS } from "@/lib/labels";
import type { Project, ProjectProgress } from "@/types/db";

/** Funding progress: approved capital (solid) and pending payments (striped). */
export function FundingBar({ target, approved, pending = 0, className }: { target: number; approved: number; pending?: number; className?: string }) {
  const pct = target ? Math.min(100, (approved / target) * 100) : 0;
  const pendPct = target ? Math.min(100 - pct, (pending / target) * 100) : 0;
  return (
    <div className={className}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Kemajuan pembiayaan"
        aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
        {pendPct > 0 && <div className="h-full bg-accent/70" style={{ width: `${pendPct}%` }} title="Menunggu pengesahan" />}
      </div>
    </div>
  );
}

export function fundingPct(target: number, approved: number) {
  return target ? Math.floor((approved / target) * 100) : 0;
}

/** "Hampir Penuh" is shown (not stored) once approved capital reaches 80%. */
export function ProjectStatus({ status, target, approved }: { status: string; target: number; approved: number }) {
  if (status === "open" && fundingPct(target, approved) >= 80) return <Badge tone="warning">Hampir Penuh</Badge>;
  return <StatusBadge map={PROJECT_STATUS} value={status} />;
}

export function ProjectCard({ project: p, progress, href, joinable }: { project: Project; progress?: ProjectProgress; href: string; joinable?: boolean }) {
  const approved = Number(progress?.approved_sen ?? 0);
  const pending = Number(progress?.pending_sen ?? 0);
  const remaining = Math.max(Number(p.target_sen) - approved, 0);
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="h-fit rounded-lg bg-secondary p-2 text-primary"><Briefcase className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold leading-tight">{p.name}</p>
            <p className="text-xs text-muted-foreground">{PROJECT_CATEGORY[p.category] ?? p.category} · {p.partner}</p>
          </div>
        </div>
        <ProjectStatus status={p.status} target={Number(p.target_sen)} approved={approved} />
      </div>
      {p.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
      <div className="mt-4 flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Terkumpul</p>
          <p className="text-lg font-bold tabular-nums">{formatRM(approved)}</p>
        </div>
        <p className="text-right text-xs text-muted-foreground">Sasaran<br /><span className="font-semibold text-foreground">{formatRM(p.target_sen)}</span></p>
      </div>
      <FundingBar className="mt-2" target={Number(p.target_sen)} approved={approved} pending={pending} />
      <p className="mt-1 text-xs text-muted-foreground">{fundingPct(Number(p.target_sen), approved)}% · Baki {formatRM(remaining)}</p>
      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
        <div><dt className="text-muted-foreground">Minimum</dt><dd className="font-semibold">{formatRM(p.min_sen)}</dd></div>
        <div><dt className="text-muted-foreground">Gandaan</dt><dd className="font-semibold">{formatRM(p.step_sen)}</dd></div>
        <div><dt className="text-muted-foreground">Tempoh</dt><dd className="font-semibold">{p.duration_months ? `${p.duration_months} bulan` : "-"}</dd></div>
      </dl>
      <div className="mt-4 flex gap-2">
        <Button asChild variant="outline" className="flex-1"><Link href={href}>Lihat Projek</Link></Button>
        {joinable && <Button asChild className="flex-1"><Link href={`${href}#sertai`}>Sertai Projek</Link></Button>}
      </div>
    </Card>
  );
}
