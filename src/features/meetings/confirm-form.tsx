"use client";
import * as React from "react";
import { ActionForm, FieldError, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { confirmAttendanceAction } from "./actions";

/** Member enters the 5-digit code given during the meeting. */
export function ConfirmAttendanceForm({ meetingId }: { meetingId: string }) {
  return (
    <ActionForm action={confirmAttendanceAction} className="space-y-3">
      <input type="hidden" name="meeting_id" value={meetingId} />
      <label htmlFor="code" className="text-sm font-medium">Kod kehadiran (5 digit)</label>
      <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={5} pattern="[0-9]{5}"
        placeholder="•••••" className="h-14 text-center text-2xl font-bold tracking-[0.5em]" aria-describedby="code-help" />
      <FieldError name="code" />
      <p id="code-help" className="text-xs text-muted-foreground">Kod diberikan oleh pentadbir semasa mesyuarat (pengumuman, skrin atau ruangan sembang).</p>
      <SubmitButton size="lg" className="w-full">Sahkan Hadir</SubmitButton>
    </ActionForm>
  );
}
