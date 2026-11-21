"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, FileSpreadsheet, FileText, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  cancelMeetingAction, closeAttendanceAction, endMeetingAction, openAttendanceAction, publishMeetingAction, setAttendanceStatusAction,
  setMeetingCodeAction,
} from "./actions";

type Act = Parameters<typeof ActionForm>[0]["action"];

function Confirmed({ action, id, label, confirm, variant = "outline", children }: {
  action: Act; id: string; label: React.ReactNode; confirm: string; variant?: "outline" | "default" | "destructive"; children?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <Button type="button" variant={variant} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <ActionForm action={action} className="w-full space-y-2 rounded-lg border bg-muted/40 p-3" onSuccess={() => setOpen(false)}>
      <input type="hidden" name="id" value={id} />
      <p className="text-sm font-medium">{confirm}</p>
      {children}
      <div className="flex gap-2">
        <SubmitButton size="sm" variant={variant === "outline" ? "default" : variant}>Ya, teruskan</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </ActionForm>
  );
}

export function MeetingActions({ id, status, attendanceOpen, finalized, invitees }: {
  id: string; status: string; attendanceOpen: boolean; finalized: boolean; invitees: number;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
      {status === "draft" && <Confirmed action={publishMeetingAction} id={id} variant="default" label="Terbitkan & hantar notifikasi"
        confirm={`Terbitkan mesyuarat ini? Notifikasi akan dihantar kepada ${invitees ? `${invitees} peserta` : "semua ahli aktif"}.`} />}
      {(status === "scheduled" || (status === "ongoing" && !attendanceOpen)) && (
        <Confirmed action={openAttendanceAction} id={id} variant="default" label="Buka sesi kehadiran"
          confirm="Buka sesi kehadiran? Status menjadi Sedang Berlangsung dan peserta boleh memasukkan kod." />
      )}
      {status === "ongoing" && attendanceOpen && (
        <Confirmed action={closeAttendanceAction} id={id} label="Tutup sesi kehadiran (sementara)" confirm="Hentikan pengesahan kehadiran buat sementara? Anda boleh membukanya semula." />
      )}
      {(status === "scheduled" || status === "ongoing") && (
        <Confirmed action={endMeetingAction} id={id} label="Tamatkan mesyuarat"
          confirm="Tamatkan mesyuarat? Ahli masih boleh mengesahkan kehadiran dengan kod sehingga 12:01 pagi. Selepas itu, yang belum mengesahkan menjadi Tidak Hadir." />
      )}
      {status === "completed" && !finalized && (
        <Confirmed action={closeAttendanceAction} id={id} label="Tutup sesi sekarang"
          confirm="Tutup sesi kehadiran sekarang? Ahli yang belum mengesahkan terus menjadi Tidak Hadir." />
      )}
      {["draft", "scheduled", "ongoing"].includes(status) && (
        <Confirmed action={cancelMeetingAction} id={id} variant="destructive" label="Batalkan mesyuarat"
          confirm="Batalkan mesyuarat ini? Peserta yang dijemput akan dimaklumkan.">
          <FormField label="Sebab pembatalan" htmlFor="cancel-reason" name="reason" required><Input id="cancel-reason" name="reason" maxLength={500} /></FormField>
        </Confirmed>
      )}
    </div>
  );
}

/** The attendance code, shown to the Super Admin only. */
export function CodePanel({ id, code }: { id: string; code: string | null }) {
  const [shown, setShown] = React.useState(true);
  const [custom, setCustom] = React.useState(false);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <p className="flex-1 rounded-xl border-2 border-dashed border-primary/40 bg-secondary py-4 text-center font-mono text-4xl font-bold tracking-[0.4em] text-primary" aria-label="Kod kehadiran">
          {code ? (shown ? code : "•••••") : "-----"}
        </p>
        <Button type="button" variant="ghost" size="icon" onClick={() => setShown((s) => !s)} aria-label={shown ? "Sembunyikan kod" : "Tunjukkan kod"}>
          {shown ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <ActionForm action={setMeetingCodeAction} showInlineError={false}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="outline" size="sm"><RefreshCw /> Jana kod baharu</SubmitButton>
        </ActionForm>
        {!custom && <Button type="button" size="sm" variant="ghost" onClick={() => setCustom(true)}>Tetapkan kod sendiri</Button>}
      </div>
      {custom && (
        <ActionForm action={setMeetingCodeAction} className="flex flex-wrap items-end gap-2" onSuccess={() => setCustom(false)}>
          <input type="hidden" name="id" value={id} />
          <FormField label="Kod 5 digit" htmlFor="custom-code" name="code">
            <Input id="custom-code" name="code" inputMode="numeric" maxLength={5} placeholder="31234" className="h-9 w-32 font-mono" />
          </FormField>
          <SubmitButton size="sm">Tetapkan</SubmitButton>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCustom(false)}>Batal</Button>
        </ActionForm>
      )}
      <p className="text-xs text-muted-foreground">Berikan kod melalui pengumuman, skrin atau ruangan sembang mesyuarat. Kod lama tidak sah selepas kod baharu dijana.</p>
    </div>
  );
}

export function CorrectionForm({ meetingId, memberId, name, status, finalized }: { meetingId: string; memberId: string; name: string; status: string; finalized: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (!open) return <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Betulkan status ${name}`}>Betulkan</Button>;
  return (
    <ActionForm action={setAttendanceStatusAction} className="w-64 space-y-2 rounded-lg border bg-muted/40 p-2" onSuccess={() => setOpen(false)}>
      <input type="hidden" name="meeting_id" value={meetingId} />
      <input type="hidden" name="member_id" value={memberId} />
      <Select name="status" defaultValue={status} className="h-9" aria-label="Status baharu">
        {!finalized && <option value="pending">Belum Mengesahkan</option>}
        <option value="present">Hadir</option>
        <option value="absent">Tidak Hadir</option>
        <option value="excused">Dikecualikan</option>
      </Select>
      <Input name="reason" placeholder="Sebab (wajib)" className="h-9" aria-label="Sebab pembetulan" />
      <div className="flex gap-2">
        <SubmitButton size="sm">Simpan</SubmitButton>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
      </div>
    </ActionForm>
  );
}

/** Refresh the server-rendered statistics while the attendance session runs. */
export function LiveRefresh({ active, seconds = 8 }: { active: boolean; seconds?: number }) {
  const router = useRouter();
  React.useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, seconds * 1000);
    return () => clearInterval(t);
  }, [active, seconds, router]);
  if (!active) return null;
  return <span className="inline-flex items-center gap-1.5 text-xs text-success"><span className="size-2 animate-pulse rounded-full bg-success" /> Dikemas kini secara langsung</span>;
}

const TYPES = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
} as const;

/** Muat Turun PDF / Excel and Kongsi (device share sheet with the file, or download as fallback). */
export function ReportButtons({ id, fileBase, title }: { id: string; fileBase: string; title: string }) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const url = (f: keyof typeof TYPES) => `/api/mesyuarat/${id}/laporan?format=${f}`;

  function download(f: keyof typeof TYPES, blob?: Blob) {
    const a = document.createElement("a");
    a.href = blob ? URL.createObjectURL(blob) : `${url(f)}&muat=1`;
    a.download = `${fileBase}.${TYPES[f].ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function share(f: keyof typeof TYPES) {
    setBusy(f);
    try {
      const res = await fetch(url(f), { cache: "no-store" });
      if (!res.ok) throw new Error("report");
      const blob = await res.blob();
      const file = new File([blob], `${fileBase}.${TYPES[f].ext}`, { type: TYPES[f].mime });
      const data: ShareData = { files: [file], title, text: `Laporan kehadiran: ${title}` };
      if (navigator.canShare?.(data)) {
        try {
          await navigator.share(data);
        } catch (e) {
          if ((e as Error).name !== "AbortError") { download(f, blob); toast.info("Perkongsian fail tidak disokong; fail dimuat turun."); }
        }
      } else {
        download(f, blob);
        toast.info("Peranti ini tidak menyokong perkongsian fail. Fail telah dimuat turun; kongsi dari folder muat turun.");
      }
    } catch {
      toast.error("Laporan tidak dapat dijana. Sila cuba lagi.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => download("pdf")}><FileText /> Muat Turun PDF</Button>
      <Button type="button" variant="outline" onClick={() => download("xlsx")}><FileSpreadsheet /> Muat Turun Excel</Button>
      <Button type="button" onClick={() => share("pdf")} disabled={!!busy}>{busy === "pdf" ? <Loader2 className="animate-spin" /> : <Share2 />} Kongsi PDF</Button>
      <Button type="button" variant="secondary" onClick={() => share("xlsx")} disabled={!!busy}>{busy === "xlsx" ? <Loader2 className="animate-spin" /> : <Share2 />} Kongsi Excel</Button>
    </div>
  );
}
