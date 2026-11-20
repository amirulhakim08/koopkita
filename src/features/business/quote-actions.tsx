"use client";
import { ArrowRight, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { convertQuoteAction, deleteQuoteDraftAction, duplicateQuoteAction, setQuoteStatusAction } from "./actions";

export function ConvertQuoteButton({ id }: { id: string }) {
  return (
    <ActionForm action={convertQuoteAction}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton className="w-full bg-[#f2b632] text-primary hover:bg-[#e3a91f]">
        Pelanggan setuju <ArrowRight /> Tukar ke Invois
      </SubmitButton>
    </ActionForm>
  );
}

export function QuoteStatusButton({ id, status }: { id: string; status: "accepted" | "rejected" }) {
  return (
    <ActionForm action={setQuoteStatusAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton variant="outline" className="w-full" pendingText="…">
        {status === "accepted" ? <><ThumbsUp /> Tanda diterima</> : <><ThumbsDown /> Ditolak</>}
      </SubmitButton>
    </ActionForm>
  );
}

export function DuplicateQuoteButton({ id }: { id: string }) {
  return (
    <ActionForm action={duplicateQuoteAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="outline" className="w-full" pendingText="…"><Copy /> Salin &amp; ubah</SubmitButton>
    </ActionForm>
  );
}

export function DeleteQuoteDraftForm({ id }: { id: string }) {
  return (
    <ActionForm action={deleteQuoteDraftAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <SubmitButton variant="ghost" size="sm" className="text-danger">Padam draf</SubmitButton>
    </ActionForm>
  );
}
