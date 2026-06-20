"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shirt,
  Store,
  LogOut,
  ChevronDown,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import { getUser, logout, type RetailLocation } from "@/lib/auth";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { href: "/", label: "Resumen", icon: LayoutDashboard },
  { href: "/catalogo", label: "Catálogo & Stock", icon: Shirt },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const [locations, setLocations] = useState<RetailLocation[]>([]);
  const [activeLocationId, setActiveLocationId] = useState("");
  const user = getUser();

  useEffect(() => {
    setActiveLocationId(localStorage.getItem("locationId") || "");
    (async () => {
      try {
        const { data } = await api.get<RetailLocation[]>("/api/admin/locations");
        const list = Array.isArray(data) ? data : [];
        setLocations(list);
        const saved = localStorage.getItem("locationId");
        if ((!saved || !list.some((l) => l.id === saved)) && list[0]?.id) {
          localStorage.setItem("locationId", list[0].id);
          setActiveLocationId(list[0].id);
        }
      } catch {
        setLocations([]);
      }
    })();
  }, []);

  function changeLocation(id: string) {
    localStorage.setItem("locationId", id);
    setActiveLocationId(id);
    window.location.reload();
  }

  const initials = (user?.name || "Tienda")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="flex h-full w-64 flex-col bg-[var(--surf-1)]" style={{ borderRight: "1px solid var(--bd-1)" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: "1px solid var(--bd-1)" }}>
        <div
          className="grid h-9 w-9 place-items-center rounded-xl text-[#06140d]"
          style={{ background: "var(--brand-primary)" }}
        >
          <ShoppingBag size={18} strokeWidth={2.4} />
        </div>
        <div className="min-w-0">
          <div
            className="text-sm font-black leading-tight tracking-tight text-[var(--tx-hi)]"
            style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}
          >
            MODA<span className="text-[var(--brand-primary)]">+</span>
          </div>
          <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--tx-dim)]">Admin Retail</div>
        </div>
      </div>

      {/* Selector de sucursal */}
      <div className="px-4 pt-4">
        <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-[var(--tx-dim)]">Sucursal activa</div>
        <div className="relative">
          <select
            value={activeLocationId}
            onChange={(e) => changeLocation(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--tx-hi)] outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
          >
            {locations.length === 0 && <option>Sin sucursales</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--tx-dim)]"
          />
        </div>
      </div>

      {/* Navegación */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-bold transition-colors"
              style={{
                background: active ? "var(--iris-soft)" : "transparent",
                color: active ? "var(--brand-primary)" : "var(--tx-mut)",
              }}
            >
              <Icon size={17} strokeWidth={active ? 2.3 : 1.9} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer usuario */}
      <div className="p-3" style={{ borderTop: "1px solid var(--bd-1)" }}>
        <div className="rounded-2xl p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <div className="mb-3 flex items-center gap-2.5">
            <div
              className="grid h-8 w-8 place-items-center rounded-lg text-[11px] font-black text-[#06140d]"
              style={{ background: "var(--brand-primary)" }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-bold text-[var(--tx-hi)]">{user?.name || "Dueño"}</div>
              <div className="truncate text-[9px] text-[var(--tx-dim)]">{user?.email}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-colors"
            style={{ background: "var(--err-soft)", color: "var(--err)", border: "1px solid var(--err)" }}
          >
            <LogOut size={13} /> Salir
          </button>
        </div>
      </div>
    </aside>
  );
}
