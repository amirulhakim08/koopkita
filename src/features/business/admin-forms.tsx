"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { adminSuspendBusinessAction, adminVerifyBusinessAction } from "./actions";

export function VerifyBusinessButton({ id, verified }: { id: string; verified: boolean }) {
  return (
    <ActionForm action={adminVerifyBusinessAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="verify" value={verified ? "false" : "true"} />
      <SubmitButton size="sm" variant={verified ? "ghost" : "default"} className={verified ? "text-xs text-muted-foreground" : ""} pendingText="…">
        {verified ? "Tarik balik" : "Sahkan SSM"}
      </SubmitButton>
    </ActionForm>
  );
}

export function SuspendBusinessForm({ id, suspended }: { id: string; suspended: boolean }) {
  return (
    <ActionForm action={adminSuspendBusinessAction} showInlineError={false} className="flex gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="suspend" value={suspended ? "false" : "true"} />
      {!suspended && <Input name="reason" placeholder="Sebab" className="h-8 w-28 text-xs" aria-label="Sebab penggantungan" />}
      <SubmitButton size="sm" variant="outline" className={suspended ? "" : "text-danger"} pendingText="…">{suspended ? "Aktifkan" : "Gantung"}</SubmitButton>
    </ActionForm>
  );
}
