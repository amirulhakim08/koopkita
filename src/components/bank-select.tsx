import { Select } from "@/components/ui/input";
import { MALAYSIAN_BANKS } from "@/lib/labels";

/** Malaysian bank picker; keeps a legacy free-text value selectable if it is not in the list. */
export function BankSelect({ id = "bank_name", defaultValue }: { id?: string; defaultValue?: string | null }) {
  const legacy = defaultValue && !(MALAYSIAN_BANKS as readonly string[]).includes(defaultValue) ? defaultValue : null;
  return (
    <Select id={id} name="bank_name" defaultValue={defaultValue ?? ""}>
      <option value="">— Pilih bank —</option>
      {legacy && <option value={legacy}>{legacy}</option>}
      {MALAYSIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
    </Select>
  );
}
