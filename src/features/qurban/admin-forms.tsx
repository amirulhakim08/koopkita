"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { setCampaignStatusAction, setSlotCancelledAction, updateCattleNotesAction } from "@/features/qurban/actions";

export function CampaignStatusButtons({ id, status }: { id: string; status: string }) {
  const transitions: Record<string, [string, string, "default" | "outline" | "destructive"][]> = {
    draft: [["open", "Buka kempen", "default"]],
    open: [["closed", "Tutup jualan", "outline"]],
    closed: [["open", "Buka semula", "outline"], ["completed", "Tandakan selesai", "default"]],
    completed: [],
  };
  return (
    <div className="flex flex-wrap gap-2">
      {transitions[status]?.map(([to, label, variant]) => (
        <ActionForm key={to} action={setCampaignStatusAction} showInlineError={false}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="status" value={to} />
          <SubmitButton variant={variant}>{label}</SubmitButton>
        </ActionForm>
      ))}
    </div>
  );
}

export function SlotToggle({ slotId, cancelled }: { slotId: string; cancelled: boolean }) {
  return (
    <ActionForm action={setSlotCancelledAction} showInlineError={false}>
      <input type="hidden" name="slot_id" value={slotId} />
      <input type="hidden" name="cancelled" value={cancelled ? "false" : "true"} />
      <SubmitButton size="sm" variant="ghost" className="h-6 px-1 text-[10px]" pendingText="…">{cancelled ? "Pulih" : "Batal"}</SubmitButton>
    </ActionForm>
  );
}

export function CattleNotesForm({ cattleId, notes }: { cattleId: string; notes: string | null }) {
  return (
    <ActionForm action={updateCattleNotesAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="cattle_id" value={cattleId} />
      <Input name="notes" defaultValue={notes ?? ""} placeholder="Catatan (baka, berat, lokasi)" className="h-8 text-xs" aria-label="Catatan lembu" />
      <SubmitButton size="sm" variant="outline" pendingText="…">Simpan</SubmitButton>
    </ActionForm>
  );
}
