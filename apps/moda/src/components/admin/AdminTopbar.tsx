"use client";

import { Search, Bell, ChevronDown, Menu } from "lucide-react";
import { getAdminUser } from "@/lib/admin-auth";
import { useDrawer } from "./atoms";

export default function AdminTopbar({ title, subtitle, searchPlaceholder = "Buscar productos, ventas, clientes…" }: { title: string; subtitle?: string; searchPlaceholder?: string }) {
  const drawer = useDrawer();
  const user = getAdminUser();
  const name = user?.name || "Renata";
  const initial = (name.trim()[0] || "R").toUpperCase();

  return (
    <header className="mb-5 flex items-center gap-3">
      <button type="button" onClick={drawer.open} aria-label="Abrir menú" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-[var(--surf-1)] text-[var(--tx-hi)] lg:hidden" style={{ borderColor: "var(--bd-1)" }}>
        <Menu size={18} />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[26px] font-extrabold leading-tight tracking-tight text-[var(--tx-hi)] md:text-[30px]" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>{title}</h1>
        {subtitle && <p className="mt-0.5 truncate text-[13px] text-[var(--tx-mut)]">{subtitle}</p>}
      </div>

      <label className="hidden h-11 max-w-[360px] flex-1 items-center gap-2.5 rounded-xl border bg-[var(--surf-1)] px-3.5 xl:flex" style={{ borderColor: "var(--bd-1)" }}>
        <Search size={17} className="text-[var(--tx-dim)]" />
        <input type="search" placeholder={searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--tx-hi)] outline-none placeholder:text-[var(--tx-dim)]" />
        <span className="hidden shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] text-[var(--tx-dim)] 2xl:inline" style={{ borderColor: "var(--bd-1)" }}>⌘K</span>
      </label>

      <button type="button" aria-label="Notificaciones" className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-[var(--surf-1)] text-[var(--tx-mut)] hover:text-[var(--tx-hi)]" style={{ borderColor: "var(--bd-1)" }}>
        <Bell size={18} />
        <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>3</span>
      </button>

      <button type="button" className="flex shrink-0 items-center gap-2 rounded-xl border bg-[var(--surf-1)] py-1.5 pl-1.5 pr-2.5" style={{ borderColor: "var(--bd-1)" }}>
        <span className="grid h-8 w-8 place-items-center rounded-lg text-[13px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>{initial}</span>
        <span className="hidden text-[13px] font-semibold text-[var(--tx-hi)] sm:inline">{name}</span>
        <ChevronDown size={15} className="text-[var(--tx-dim)]" />
      </button>
    </header>
  );
}
