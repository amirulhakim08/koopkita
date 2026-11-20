"use client";
import * as React from "react";
import { Eye, EyeOff, Trash2 } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { senToDecimal } from "@/lib/format";
import { deleteCatalogItemAction, saveCatalogItemAction, setCatalogActiveAction } from "./actions";

export type CatalogItem = { id: string; name: string; price_sen: number; active: boolean };

/** Add a product / service, or edit one (name + preferred price). */
export function CatalogItemForm({ item }: { item?: CatalogItem }) {
  const p = item?.id ?? "new";
  return (
    <ActionForm action={saveCatalogItemAction} className="space-y-3" resetOnSuccess={!item}>
      {item && <input type="hidden" name="id" value={item.id} />}
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <FormField label="Nama produk / servis" htmlFor={`k-name-${p}`} name="name" required hint={item ? undefined : "Masukkan saiz atau unit dalam nama, cth. Ikan kembung 1kg"}>
          <Input id={`k-name-${p}`} name="name" defaultValue={item?.name ?? ""} maxLength={300} />
        </FormField>
        <FormField label="Harga (RM)" htmlFor={`k-price-${p}`} name="price" required>
          <Input id={`k-price-${p}`} name="price" inputMode="decimal" placeholder="0.00" defaultValue={item ? senToDecimal(item.price_sen) : ""} />
        </FormField>
      </div>
      <SubmitButton size="sm">{item ? "Simpan" : "Tambah ke katalog"}</SubmitButton>
    </ActionForm>
  );
}

/** Hide an item from the picker (seasonal items), or show it again. */
export function CatalogActiveButton({ id, active, name }: { id: string; active: boolean; name: string }) {
  return (
    <ActionForm action={setCatalogActiveAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <SubmitButton size="sm" variant={active ? "ghost" : "outline"} pendingText="…"
        aria-label={`${active ? "Sembunyikan" : "Paparkan semula"} ${name}`}>
        {active ? <><EyeOff /> Sembunyikan</> : <><Eye /> Paparkan semula</>}
      </SubmitButton>
    </ActionForm>
  );
}

/** Delete an item the member no longer sells; asks for confirmation first. */
export function CatalogDeleteButton({ id, name }: { id: string; name: string }) {
  const [confirming, setConfirming] = React.useState(false);
  if (!confirming) {
    return (
      <Button type="button" size="sm" variant="ghost" className="text-danger" aria-label={`Padam ${name}`} onClick={() => setConfirming(true)}>
        <Trash2 /> Padam
      </Button>
    );
  }
  return (
    <ActionForm action={deleteCatalogItemAction} showInlineError={false} className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-soft px-2 py-1">
      <input type="hidden" name="id" value={id} />
      <span className="text-xs font-medium text-danger">Padam &quot;{name}&quot;?</span>
      <SubmitButton size="sm" variant="destructive" pendingText="…">Ya, padam</SubmitButton>
      <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>Batal</Button>
    </ActionForm>
  );
}
