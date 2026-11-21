"use client";
import * as React from "react";
import { Search } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { todayKL } from "@/lib/format";
import type { Meeting } from "@/types/db";
import { saveMeetingAction } from "./actions";
import { platformOf } from "./meeting-utils";

export type PickMember = { id: string; full_name: string; membership_id: string | null };

/** Create or edit a meeting; participants are all active members or a searchable selection. */
export function MeetingForm({ meeting: m, members, selected = [], lockAudience = false }: {
  meeting?: Meeting; members: PickMember[]; selected?: string[]; lockAudience?: boolean;
}) {
  const [mode, setMode] = React.useState<Meeting["mode"]>(m?.mode ?? "physical");
  const [audience, setAudience] = React.useState<Meeting["audience"]>(m?.audience ?? "all");
  const [picked, setPicked] = React.useState<Set<string>>(new Set(selected));
  const [q, setQ] = React.useState("");
  const [url, setUrl] = React.useState(m?.online_url ?? "");
  const shown = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return members.filter((x) => !s || x.full_name.toLowerCase().includes(s) || (x.membership_id ?? "").toLowerCase().includes(s));
  }, [members, q]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <ActionForm action={saveMeetingAction} className="space-y-6">
      {m && <input type="hidden" name="id" value={m.id} />}
      <Card>
        <CardHeader><CardTitle>Maklumat mesyuarat</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <FormField label="Tajuk mesyuarat" htmlFor="title" required className="space-y-1.5 sm:col-span-3">
            <Input id="title" name="title" defaultValue={m?.title} placeholder="cth. Mesyuarat Ahli Lembaga" />
          </FormField>
          <FormField label="Tarikh" htmlFor="meeting_date" required>
            <Input id="meeting_date" name="meeting_date" type="date" defaultValue={m?.meeting_date ?? todayKL()} />
          </FormField>
          <FormField label="Masa mula" htmlFor="start_time" required>
            <Input id="start_time" name="start_time" type="time" defaultValue={m?.start_time?.slice(0, 5) ?? "20:30"} />
          </FormField>
          <FormField label="Masa tamat (pilihan)" htmlFor="end_time">
            <Input id="end_time" name="end_time" type="time" defaultValue={m?.end_time?.slice(0, 5) ?? ""} />
          </FormField>
          <FormField label="Agenda" htmlFor="agenda" className="space-y-1.5 sm:col-span-3">
            <Textarea id="agenda" name="agenda" rows={6} defaultValue={m?.agenda ?? ""} placeholder={"1. Bacaan doa\n2. Kata aluan Pengerusi\n3. ..."} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Jenis dan tempat</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <fieldset className="grid grid-cols-3 gap-2" aria-label="Jenis mesyuarat">
            {([["physical", "Fizikal"], ["online", "Online"], ["hybrid", "Hybrid"]] as const).map(([v, l]) => (
              <label key={v} className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium",
                mode === v ? "border-primary bg-secondary text-primary" : "hover:bg-muted")}>
                <input type="radio" name="mode" value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" /> {l}
              </label>
            ))}
          </fieldset>
          {mode !== "online" && (
            <FormField label="Lokasi" htmlFor="location" required>
              <Input id="location" name="location" defaultValue={m?.location ?? ""} placeholder="cth. Dewan Koperasi, Alor Setar" />
            </FormField>
          )}
          {mode !== "physical" && (
            <FormField label="Pautan mesyuarat (Google Meet, Zoom atau Teams)" htmlFor="online_url" required
              hint={platformOf(url) ? `Dikesan: ${platformOf(url)}` : "Mesti bermula dengan https://"}>
              <Input id="online_url" name="online_url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://meet.google.com/abc-defg-hij" />
            </FormField>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Peserta</CardTitle>
          <CardDescription>Hanya peserta dijemput menerima notifikasi, melihat mesyuarat dan boleh mengesahkan kehadiran.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {lockAudience ? (
            <>
              <input type="hidden" name="audience" value={audience} />
              {audience === "selected" && [...picked].map((id) => <input key={id} type="hidden" name="member_ids" value={id} />)}
              <Alert tone="info">Peserta tidak boleh diubah selepas mesyuarat bermula.</Alert>
            </>
          ) : (
            <>
              <fieldset className="grid gap-2 sm:grid-cols-2" aria-label="Pilihan peserta">
                {([["all", "Semua Ahli Aktif", `${members.length} ahli aktif dijemput secara automatik`], ["selected", "Ahli Terpilih", "Cari dan pilih ahli satu persatu"]] as const).map(([v, l, d]) => (
                  <label key={v} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3 text-sm", audience === v ? "border-primary bg-secondary" : "hover:bg-muted")}>
                    <input type="radio" name="audience" value={v} checked={audience === v} onChange={() => setAudience(v)} className="mt-0.5 accent-[var(--primary)]" />
                    <span><strong className="block">{l}</strong><span className="text-xs text-muted-foreground">{d}</span></span>
                  </label>
                ))}
              </fieldset>
              {audience === "selected" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="relative min-w-0 flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama atau nombor ahli" className="pl-9" aria-label="Cari ahli" />
                    </div>
                    <span className="text-sm font-semibold text-primary">{picked.size} dipilih</span>
                  </div>
                  <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border" aria-label="Senarai ahli">
                    {shown.map((x) => (
                      <li key={x.id}>
                        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                          <input type="checkbox" name="member_ids" value={x.id} checked={picked.has(x.id)} onChange={() => toggle(x.id)} className="size-4 accent-[var(--primary)]" />
                          <span className="min-w-0 flex-1 truncate">{x.full_name}</span>
                          <span className="font-mono text-xs text-muted-foreground">{x.membership_id}</span>
                        </label>
                      </li>
                    ))}
                    {!shown.length && <li className="p-3 text-sm text-muted-foreground">Tiada ahli sepadan.</li>}
                  </ul>
                  {/* keep picked members that the search hides */}
                  {[...picked].filter((id) => !shown.some((x) => x.id === id)).map((id) => <input key={id} type="hidden" name="member_ids" value={id} />)}
                  <FieldError name="member_ids" />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <SubmitButton size="lg" className="w-full sm:w-auto">{m ? "Simpan perubahan" : "Simpan sebagai draf"}</SubmitButton>
    </ActionForm>
  );
}
