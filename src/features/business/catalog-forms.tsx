"use client";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { senToDecimal } from "@/lib/format";
import { saveCatalogItemAction, setCatalogActiveAction } from "./actions";

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

export function CatalogActiveButton({ id, active }: { id: string; active: boolean }) {
  return (
    <ActionForm action={setCatalogActiveAction} showInlineError={false}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <SubmitButton size="sm" variant="ghost" className={active ? "text-muted-foreground" : "text-primary"} pendingText="…">
        {active ? "Sembunyikan" : "Paparkan semula"}
      </SubmitButton>
    </ActionForm>
  );
}
