"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout, getUser, isSuperAdmin } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import api from "@/lib/api";

const SECTIONS = [
  {
    key: "tpv",
    label: "Punto de Venta",
    icon: "🖥️",
    color: "var(--gold)",
    items: [
      { href: "/admin/pedidos",           icon: "📋", label: "Pedidos" },
      // SE QUITÓ MESEROS DE AQUÍ
    ],
  },
  {
    key: "menu",
    label: "Menú",
    icon: "🍔",
    color: "#3b82f6",
    items: [
      { href: "/admin/menu",              icon: "🍔", label: "Platillos" },
      { href: "/admin/menu/categorias",   icon: "📂", label: "Categorías" },
      { href: "/admin/menu/variantes",    icon: "🔀", label: "Variantes" },
      { href: "/admin/banners",           icon: "🖼️", label: "Banners" },
      { href: "/admin/inventario",        icon: "📦", label: "Inventario" },
    ],
  },
  {
    key: "staff",
    label: "Personal",
    icon: "👥",
    color: "#8b5cf6",
    items: [
      { href: "/admin/empleados",         icon: "👥", label: "Empleados" },
      { href: "/admin/turnos",            icon: "🕒", label: "Turnos de caja" },
      { href: "/admin/caja-repartidores", icon: "💵", label: "Caja Rep." },
      { href: "/admin/rastreo",           icon: "📍", label: "Rastreo GPS" },
    ],
  },
  {
    key: "bo",
    label: "Back Office",
    icon: "📊",
    color: "#22c55e",
    items: [
      { href: "/admin",                           icon: "📊", label: "Dashboard" },
      { href: "/admin/restaurant-dashboard",      icon: "🍽️", label: "Rest. Dashboard" },
      { href: "/admin/clientes",          icon: "🏢", label: "Mi Marca" },
      { href: "/admin/reportes",          icon: "📈", label: "Reportes" },
      { href: "/admin/impresoras",        icon: "🖨️", label: "Impresoras" },
      { href: "/admin/integraciones",     icon: "🔌", label: "Integraciones" },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  const [user, setUser]           = useState<any>(null);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [locations, setLocations] = useState<any[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [imgError, setImgError] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    setSuperAdmin(isSuperAdmin());

    if (currentUser) {
      api.get("/api/admin/locations").then(res => {
        setLocations(res.data);
        const savedLoc = localStorage.getItem("locationId");
        if (savedLoc) {
          setActiveLocationId(savedLoc);
        } else if (res.data.length > 0) {
          const firstId = res.data[0].id;
          localStorage.setItem("locationId", firstId);
          setActiveLocationId(firstId);
        }
      }).catch(err => console.error("Error cargando sucursales:", err));
    }

    setOpen(getDefaultOpen());
  }, [path]);

  const handleLocationChange = (id: string) => {
    localStorage.setItem("locationId", id);
    setActiveLocationId(id);
    window.location.reload();
  };

  function getDefaultOpen() {
    const openState: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      const hasActive = section.items.some(item =>
        item.href === "/admin" ? path === "/admin" : path.startsWith(item.href)
      );
      openState[section.key] = hasActive;
    }
    if (!Object.values(openState).some(Boolean)) openState[SECTIONS[0].key] = true;
    return openState;
  }

  function toggle(key: string) {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col border-r z-40 shadow-2xl"
      style={{ background: "var(--surf)", borderColor: "var(--border)" }}>

      <div className="px-5 py-6 border-b flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center gap-3 mb-6">
          {!imgError ? (
            <Image src="/logo.png" alt="Logo" width={40} height={40} className="rounded-xl object-cover" onError={() => setImgError(true)} />
          ) : (
            <span className="text-2xl">🍔</span>
          )}
          <div>
            <div className="font-syne font-black text-sm leading-tight text-white uppercase tracking-tighter">
              MRTPVREST
            </div>
            <div className="text-[10px] font-black tracking-widest text-[var(--gold)] uppercase opacity-70">Control Panel</div>
          </div>
        </div>

        <div className="relative group">
          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1.5 block ml-1">Sucursal Activa</label>
          <select
            value={activeLocationId}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-bold text-white outline-none focus:border-[var(--gold)] transition-all appearance-none cursor-pointer"
          >
            {locations.length === 0 && <option>Cargando...</option>}
            {locations.map(loc => (
              <option key={loc.id} value={loc.id} className="bg-[#1a1a1a] text-white">
                📍 {loc.name}
              </option>
            ))}
          </select>
          <div className="absolute right-3 bottom-3 pointer-events-none text-[8px] opacity-40">▼</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map(section => {
          const isOpen = !!open[section.key];
          const hasActive = section.items.some(item =>
            item.href === "/admin" ? path === "/admin" : path.startsWith(item.href)
          );

          return (
            <div key={section.key} className="mb-2">
              <button
                onClick={() => toggle(section.key)}
                className="w-full flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-all hover:bg-white/5"
                style={{
                  background: hasActive ? `${section.color}10` : "transparent",
                  border: hasActive ? `1px solid ${section.color}25` : "1px solid transparent",
                }}>
                <span className="text-base flex-shrink-0">{section.icon}</span>
                <span className="flex-1 font-syne font-black text-[11px] uppercase tracking-wider"
                  style={{ color: hasActive ? section.color : "var(--muted)" }}>
                  {section.label}
                </span>
                <span className={`text-[10px] transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
              </button>

              {isOpen && (
                <div className="ml-4 pl-3 border-l-2 mt-1 mb-2 flex flex-col gap-1"
                  style={{ borderColor: `${section.color}30` }}>
                  {section.items.map(item => {
                    const active = item.href === "/admin" ? path === "/admin" : path.startsWith(item.href);
                    return (
                      <Link key={item.href} href={item.href}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:pl-4"
                        style={{
                          background: active ? `${section.color}15` : "transparent",
                          color: active ? section.color : "var(--muted)",
                        }}>
                        <span className="text-sm opacity-70">{item.icon}</span>
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Sección exclusiva SUPER_ADMIN */}
      {superAdmin && (
        <div className="px-2 pb-2">
          <div className="border border-orange-500/20 rounded-2xl overflow-hidden">
            <button
              onClick={() => toggle("saas")}
              className="w-full flex items-center gap-2.5 px-3 py-3 text-left transition-all hover:bg-orange-500/5"
              style={{ background: path.startsWith("/dashboard") ? "rgba(249,115,22,0.08)" : "transparent" }}>
              <span className="text-base flex-shrink-0">🏢</span>
              <span className="flex-1 font-syne font-black text-[11px] uppercase tracking-wider text-orange-400">
                MRTPVREST
              </span>
              <span className="text-[9px] bg-orange-500 text-black px-1.5 py-0.5 rounded font-black">SA</span>
            </button>
            {open["saas"] && (
              <div className="ml-4 pl-3 border-l-2 border-orange-500/20 flex flex-col gap-1 pb-2">
                <Link href="/dashboard"
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:pl-4"
                  style={{ color: path === "/dashboard" ? "#f97316" : "var(--muted)", background: path === "/dashboard" ? "rgba(249,115,22,0.1)" : "transparent" }}>
                  <span className="text-sm opacity-70">🏪</span>
                  <span>Tenants / MRR</span>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="p-4 border-t" style={{ borderColor: "var(--border)" }}>
        <div className="p-4 rounded-[1.5rem] bg-black/40 border border-white/5 shadow-inner">
          <div className="text-[10px] font-black text-white mb-0.5 truncate uppercase tracking-tighter">{user?.name || "Admin"}</div>
          <div className="text-[9px] mb-3 truncate font-bold text-gray-500 uppercase tracking-widest">{user?.email}</div>
          <div className="flex items-center justify-between mb-4 px-1">
            <span className="text-[9px] font-black text-gray-500 uppercase">Tema</span>
            <ThemeToggle size="sm" />
          </div>
          <button onClick={logout}
            className="text-[10px] font-black py-2.5 rounded-xl w-full transition-all uppercase tracking-widest"
            style={{ background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>
            SALIR DEL SISTEMA
          </button>
        </div>
      </div>
    </aside>
  );
}
