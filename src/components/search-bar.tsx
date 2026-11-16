import { Search } from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/** Plain GET form — works without JavaScript and keeps filters in the URL. */
export function SearchBar({
  q, placeholder = "Cari…", filters = [],
}: { q?: string; placeholder?: string; filters?: { name: string; value?: string; options: [string, string][]; label: string }[] }) {
  return (
    <form className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center" role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" aria-label="Carian" />
      </div>
      {filters.map((f) => (
        <Select key={f.name} name={f.name} defaultValue={f.value ?? ""} className="sm:w-52" aria-label={f.label}>
          <option value="">{f.label}: Semua</option>
          {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      ))}
      <Button type="submit" variant="outline">Tapis</Button>
    </form>
  );
}
