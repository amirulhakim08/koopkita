"use client";
import * as React from "react";
import { Search, UserPlus, UserRound, X } from "lucide-react";
import { useFieldError } from "@/components/action-form";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { findByPhone, matchCustomers, type CustomerLite } from "./customer-match";

type Mode = "search" | "existing" | "new" | "walkin";

/**
 * One box to find a customer by name or phone, or add a new one on the spot.
 * Submits: customer_mode (existing | new | walkin), customer_id, customer_name, customer_phone.
 * A new customer is saved by the server action when the document is created.
 */
export function CustomerPicker({ customers, defaultId, allowWalkIn = false }: { customers: CustomerLite[]; defaultId?: string; allowWalkIn?: boolean }) {
  const initial = defaultId ? customers.find((c) => c.id === defaultId) : undefined;
  const [mode, setMode] = React.useState<Mode>(initial ? "existing" : "search");
  const [selected, setSelected] = React.useState<CustomerLite | undefined>(initial);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const error = useFieldError("customer");
  const nameError = useFieldError("customer_name");
  const phoneError = useFieldError("customer_phone");

  const matches = matchCustomers(customers, query);
  const sameNumber = mode === "new" ? findByPhone(customers, phone) : undefined;

  function pick(c: CustomerLite) {
    setSelected(c);
    setMode("existing");
    setOpen(false);
    setQuery("");
  }
  function startNew() {
    const q = query.trim();
    const looksLikePhone = /^[+\d\s-]{6,}$/.test(q);
    setName(looksLikePhone ? "" : q);
    setPhone(looksLikePhone ? q : "");
    setMode("new");
    setOpen(false);
  }
  function reset() {
    setMode("search");
    setSelected(undefined);
    setQuery("");
  }

  return (
    <div className="space-y-1.5">
      <input type="hidden" name="customer_mode" value={mode} />
      {mode === "existing" && selected && <input type="hidden" name="customer_id" value={selected.id} />}

      {mode === "search" && (
        <>
          <Label htmlFor="customer_search">Pelanggan<span className="ml-0.5 text-danger">*</span></Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="customer_search" value={query} autoComplete="off" placeholder="Cari nama atau no. telefon"
              className="pl-9" role="combobox" aria-expanded={open} aria-controls="customer_options"
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); if (e.key === "Escape") setOpen(false); }} />
            {open && (
              <ul id="customer_options" role="listbox" aria-label="Pilihan pelanggan"
                className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border bg-white p-1 shadow-lg">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" role="option" aria-selected={false} onClick={() => pick(c)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-xs text-muted-foreground">{c.phone ?? ""}</span>
                    </button>
                  </li>
                ))}
                {!matches.length && query.trim() && <li className="px-3 py-2 text-xs text-muted-foreground">Tiada pelanggan sepadan.</li>}
                <li>
                  <button type="button" role="option" aria-selected={false} onClick={startNew}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-primary hover:bg-muted">
                    <UserPlus className="size-4" /> Tambah pelanggan baharu{query.trim() ? ` "${query.trim()}"` : ""}
                  </button>
                </li>
              </ul>
            )}
          </div>
          {allowWalkIn && (
            <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => { setMode("walkin"); setOpen(false); }}>
              Pelanggan Tunai (tanpa nama)
            </Button>
          )}
          {error?.length ? <p className="text-xs font-medium text-danger">{error[0]}</p> : null}
        </>
      )}

      {(mode === "existing" || mode === "walkin") && (
        <>
          <Label>Pelanggan</Label>
          <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm">
              <UserRound className="size-4 text-muted-foreground" />
              <span>
                <span className="font-semibold" data-testid="customer-chosen">{mode === "walkin" ? "Pelanggan Tunai" : selected?.name}</span>
                {mode === "existing" && selected?.phone && <span className="block text-xs text-muted-foreground">{selected.phone}</span>}
              </span>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>Tukar</Button>
          </div>
        </>
      )}

      {mode === "new" && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Pelanggan baharu</p>
            <button type="button" onClick={reset} aria-label="Batal pelanggan baharu" className="rounded p-1 hover:bg-muted"><X className="size-4" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customer_name">Nama pelanggan<span className="ml-0.5 text-danger">*</span></Label>
              <Input id="customer_name" name="customer_name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} />
              {nameError?.length ? <p className="text-xs font-medium text-danger">{nameError[0]}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer_phone">No. telefon (pilihan)</Label>
              <Input id="customer_phone" name="customer_phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              {phoneError?.length ? <p className="text-xs font-medium text-danger">{phoneError[0]}</p> : null}
            </div>
          </div>
          {sameNumber && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
              <span>Nombor ini milik <strong>{sameNumber.name}</strong>. Guna pelanggan ini?</span>
              <Button type="button" size="sm" variant="outline" onClick={() => pick(sameNumber)}>Guna pelanggan ini</Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Pelanggan ini akan disimpan dalam senarai Pelanggan anda.</p>
        </div>
      )}
    </div>
  );
}
