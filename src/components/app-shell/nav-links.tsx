"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import { createPortal } from "react-dom";
import {
  Bell, Beef, Landmark, FileSpreadsheet, Home, LayoutDashboard, Megaphone, Menu, Coins, Receipt, Settings, ShieldCheck, User, Users, Wallet, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem } from "./nav-config";

const ICONS = {
  home: Home, beef: Beef, coins: Coins, wallet: Wallet, bell: Bell, user: User, dashboard: LayoutDashboard,
  users: Users, receipt: Receipt, file: FileSpreadsheet, megaphone: Megaphone, shield: ShieldCheck, settings: Settings, landmark: Landmark,
} as const;

function isActive(pathname: string, href: string, root: string) {
  return href === root ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Home;
        const active = isActive(pathname, item.href, root);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/75 hover:bg-secondary hover:text-primary",
            )}
          >
            <Icon className="size-4" /> {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items, root }: { items: NavItem[]; root: string }) {
  const pathname = usePathname();
  const mobile = items.filter((i) => i.mobile).slice(0, 5);
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 backdrop-blur lg:hidden" aria-label="Navigasi utama">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${mobile.length}, minmax(0, 1fr))` }}>
        {mobile.map((item) => {
          const Icon = ICONS[item.icon as keyof typeof ICONS] ?? Home;
          const active = isActive(pathname, item.href, root);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn("flex flex-col items-center gap-1 py-2 text-[11px] font-medium", active ? "text-primary" : "text-muted-foreground")}
              >
                <span className={cn("rounded-full px-4 py-1", active && "bg-secondary")}>
                  <Icon className="size-5" />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileMenu({ items, root, footer }: { items: NavItem[]; root: string; footer?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = React.useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  return (
    <>
      <button type="button" className="rounded-lg p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
        <Menu className="size-5" />
      </button>
      {open &&
        // Rendered into <body>: the sticky header uses backdrop-filter, which would
        // otherwise trap this fixed overlay inside the header's 56px height.
        createPortal(
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col gap-4 overflow-y-auto bg-white p-4 shadow-xl pb-safe">
              <div className="flex items-center justify-between">
                <span className="font-bold text-primary">KoopKITA</span>
                <button type="button" className="rounded-lg p-2 hover:bg-muted" onClick={() => setOpen(false)} aria-label="Tutup menu">
                  <X className="size-5" />
                </button>
              </div>
              <SidebarNav items={items} root={root} />
              <div className="mt-auto">{footer}</div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
