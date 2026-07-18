"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Tag, Tags, TrendingUp, Users, Download, Settings, LogOut, ChevronDown, ShoppingBag, Building2, MoreVertical, type LucideIcon } from "lucide-react";
import api from "@/lib/admin-api";
import { ADMIN_KEYS, getAdminUser, adminLogout } from "@/lib/admin-auth";

type NavItem = { href: string; label: string; icon: LucideIcon };
// "Clientes" NO está aquí a propósito: esa pantalla no hace ni una llamada al
// backend — sus 2,845 clientes, 156 VIP y 38.7% de recompra son constantes
// escritas a mano. Enseñarla como una sección más hacía que un tenant con cero
// clientes viera una cartera inventada. La ruta sigue existiendo (/admin/clientes)
// para retomarla; vuelve al nav cuando lea datos reales.
const NAV: NavItem[] = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/catalogo", label: "Catálogo & Stock", icon: Tag },
  { href: "/admin/listas", label: "Listas de precio", icon: Tags },
  { href: "/admin/ventas", label: "Ventas", icon: TrendingUp },
  { href: "/admin/descargas", label: "Descargar caja", icon: Download },
  { href: "/admin/configuracion", label: "Configuración", icon: Settings },
];

interface Loc { id: string; name: string }

export default function AdminSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const path = usePathname();
  const [locations, setLocations] = useState<Loc[]>([]);
  const [activeLocationId, setActiveLocationId] = useState("");
  const user = getAdminUser();

  useEffect(() => {
    setActiveLocationId(localStorage.getItem(ADMIN_KEYS.locationId) || "");
    (async () => {
      try {
        const { data } = await api.get<Loc[]>("/api/admin/locations");
        const list = Array.isArray(data) ? data : [];
        setLocations(list);
        const saved = localStorage.getItem(ADMIN_KEYS.locationId);
        if ((!saved || !list.some((l) => l.id === saved)) && list[0]?.id) {
          localStorage.setItem(ADMIN_KEYS.locationId, list[0].id);
          localStorage.setItem(ADMIN_KEYS.locationName, list[0].name || "");
          setActiveLocationId(list[0].id);
        }
      } catch {
        setLocations([]);
      }
    })();
  }, []);

  function changeLocation(id: string) {
    const loc = locations.find((l) => l.id === id);
    localStorage.setItem(ADMIN_KEYS.locationId, id);
    if (loc) localStorage.setItem(ADMIN_KEYS.locationName, loc.name || "");
    setActiveLocationId(id);
    window.dispatchEvent(new Event("locationChanged"));
    window.location.reload();
  }

  const initials = (user?.name || "Renata").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();

  return (
    <aside className="flex h-full w-[264px] flex-col" style={{ background: "var(--sidebar)", color: "#f1f5f9", borderRight: "1px solid var(--sidebar-bd)" }}>
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl text-white" style={{ background: "var(--brand-primary)" }}><ShoppingBag size={20} strokeWidth={2.2} /></span>
        <span>
          <span className="block text-[17px] font-extrabold leading-none tracking-tight" style={{ fontFamily: "var(--font-syne), Syne, sans-serif" }}>MRT<span style={{ color: "var(--brand-primary)" }}>PV</span></span>
          <span className="mt-0.5 block text-[11px] font-semibold text-[#94a3b8]">Admin <span className="text-[#cbd5e1]">Retail</span></span>
        </span>
      </div>

      <div className="px-4 pb-1 pt-2">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#64748b]">Sucursal activa</div>
        <div className="relative">
          <Building2 size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <select value={activeLocationId} onChange={(e) => changeLocation(e.target.value)} className="w-full cursor-pointer appearance-none rounded-xl py-2.5 pl-9 pr-8 text-[13px] font-semibold text-[#f1f5f9] outline-none" style={{ background: "var(--sidebar-soft)", border: "1px solid var(--sidebar-bd)" }}>
            {locations.length === 0 && <option>Principal</option>}
            {locations.map((loc) => <option key={loc.id} value={loc.id} style={{ color: "#0f172a" }}>{loc.name}</option>)}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/admin" ? path === "/admin" : path.startsWith(href);
          return (
            <Link key={href} href={href} onClick={onNavigate} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors"
              style={{ background: active ? "rgba(34,197,94,.16)" : "transparent", color: active ? "#4ade80" : "#cbd5e1" }}>
              <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-3" style={{ borderTop: "1px solid var(--sidebar-bd)" }}>
        <div className="mb-2 flex items-center gap-2.5 rounded-2xl p-2.5" style={{ background: "var(--sidebar-soft)" }}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[12px] font-bold text-white" style={{ background: "var(--brand-primary)" }}>{initials}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-bold text-[#f1f5f9]">{user?.name || "Renata"}</span>
            <span className="block truncate text-[10px] text-[#64748b]">{user?.email || "renata.bp@gmail.com"}</span>
          </span>
          <MoreVertical size={16} className="shrink-0 text-[#64748b]" />
        </div>
        <button type="button" onClick={adminLogout} className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[12px] font-semibold text-[#cbd5e1] transition-colors hover:bg-[var(--sidebar-soft)]" style={{ border: "1px solid var(--sidebar-bd)" }}>
          <LogOut size={15} /> Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
