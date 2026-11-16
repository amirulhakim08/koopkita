"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input } from "@/components/ui/input";
import { reviewSharePaymentAction } from "@/features/shares/actions";

export function ShareReviewForm({ id }: { id: string }) {
  return (
    <ActionForm action={reviewSharePaymentAction} className="flex min-w-64 flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Input name="notes" placeholder="Catatan / sebab penolakan" className="h-8 text-xs" aria-label="Catatan semakan" />
      <div className="flex gap-2">
        <SubmitButton size="sm" name="decision" value="approve" className="flex-1">Lulus</SubmitButton>
        <SubmitButton size="sm" variant="outline" name="decision" value="reject" className="flex-1 text-danger">Tolak</SubmitButton>
      </div>
    </ActionForm>
  );
}
