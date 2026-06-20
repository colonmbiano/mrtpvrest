"use client";
import { useEffect, useRef, useState } from "react";
import { Search, Bell, Menu } from "lucide-react";
import { getUser } from "@/lib/auth";
import type { AdminUser } from "@/types/admin";

/**
 * Header superior del admin (desktop). Buscador global con atajo ⌘/Ctrl-K,
 * campana de notificaciones con badge y avatar del usuario. El título y
 * subtítulo de cada pantalla los sigue poniendo <PageHeader> dentro de la
 * página, justo debajo de esta barra.
 */
export default function AdminTopbar({ onOpenMenu }: { onOpenMenu?: () => void }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setUser(getUser() as AdminUser | null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : "AD";

  return (
    <header
      className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3 md:px-8"
      style={{ background: "rgba(246,248,250,.82)", backdropFilter: "blur(8px)", borderBottom: "1px solid var(--bd-1)" }}
    >
      {onOpenMenu && (
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Abrir menú"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl md:hidden"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx-mid)" }}
        >
          <Menu size={18} />
        </button>
      )}

      {/* Buscador global */}
      <div className="relative hidden min-w-0 flex-1 md:block">
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tx-dim" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Buscar productos, ventas, clientes"
          placeholder="Buscar productos, ventas, clientes…"
          className="h-11 w-full max-w-xl rounded-xl pl-10 pr-16 text-sm outline-none transition-colors"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
        />
        <kbd
          className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tx-dim lg:block"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          ⌘K
        </kbd>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx-mid)" }}
        >
          <Bell size={18} />
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full"
            style={{ background: "var(--err)", boxShadow: "0 0 0 2px var(--surf-1)" }}
          />
        </button>
        <div className="flex items-center gap-2.5 rounded-xl py-1 pl-1 pr-3" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[12px] font-extrabold text-white"
            style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))" }}
          >
            {initials}
          </span>
          <div className="hidden min-w-0 leading-tight sm:block">
            <div className="truncate text-[12px] font-bold text-tx-hi">{user?.name || "Admin"}</div>
            <div className="truncate text-[10px] text-tx-mut">{user?.email || ""}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
