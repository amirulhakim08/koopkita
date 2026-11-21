"use client";
import * as React from "react";
import { Search, Users, UserCheck } from "lucide-react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { sendAnnouncementAction } from "@/features/notifications/actions";
import { cn } from "@/lib/utils";

type Member = { id: string; full_name: string; membership_id: string | null; state: string | null };

export function AnnouncementForm({ members }: { members: Member[] }) {
  const [target, setTarget] = React.useState<"all" | "selected">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? members.filter((m) => `${m.full_name} ${m.membership_id ?? ""} ${m.state ?? ""}`.toLowerCase().includes(needle))
    : members;
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <ActionForm action={sendAnnouncementAction} className="space-y-4" resetOnSuccess onSuccess={() => setSelected(new Set())}>
      <input type="hidden" name="target" value={target} />
      {target === "selected" && [...selected].map((id) => <input key={id} type="hidden" name="user_ids" value={id} />)}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Penerima</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["all", "Semua ahli aktif", `${members.length} ahli`, Users], ["selected", "Ahli tertentu", `${selected.size} dipilih`, UserCheck]] as const).map(([v, label, hint, Icon]) => (
            <label key={v} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm",
              target === v ? "border-primary bg-accent-soft" : "hover:bg-muted")}>
              <input type="radio" name="target_choice" checked={target === v} onChange={() => setTarget(v)} className="accent-[var(--primary)]" />
              <Icon className="size-4 text-primary" />
              <span><span className="font-semibold">{label}</span><span className="block text-xs text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      {target === "selected" && (
        <div className="space-y-2 rounded-lg border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari nama, no. ahli atau negeri" className="pl-9" aria-label="Cari ahli" />
            </div>
            <button type="button" className="text-xs font-semibold text-primary hover:underline"
              onClick={() => setSelected((s) => new Set([...s, ...visible.map((m) => m.id)]))}>Pilih semua dipaparkan</button>
            <button type="button" className="text-xs font-semibold text-muted-foreground hover:underline" onClick={() => setSelected(new Set())}>Kosongkan</button>
          </div>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
            {visible.map((m) => (
              <li key={m.id}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted">
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} className="size-4 accent-[var(--primary)]"
                    aria-label={m.full_name} />
                  <span className="flex-1">{m.full_name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{m.membership_id}</span>
                </label>
              </li>
            ))}
            {!visible.length && <li className="px-3 py-4 text-center text-sm text-muted-foreground">Tiada ahli sepadan.</li>}
          </ul>
          <p className="text-xs text-muted-foreground">{selected.size} ahli dipilih</p>
          <FieldError name="user_ids" />
        </div>
      )}

      <FormField label="Tajuk" htmlFor="title" required><Input id="title" name="title" maxLength={150} /></FormField>
      <FormField label="Mesej" htmlFor="body" required><Textarea id="body" name="body" rows={5} maxLength={2000} /></FormField>
      <FormField label="Pautan dalaman (pilihan)" htmlFor="link" hint="cth. /ahli/projek atau /ahli/wallet"><Input id="link" name="link" /></FormField>
      <SubmitButton className="w-full" disabled={target === "selected" && selected.size === 0}>
        {target === "all" ? `Hantar kepada semua ahli (${members.length})` : `Hantar kepada ${selected.size} ahli dipilih`}
      </SubmitButton>
    </ActionForm>
  );
}
