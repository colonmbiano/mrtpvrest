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
    key: "menu",
    label: "Menú",
    icon: "🍔",
    accent: "#3b82f6",
    items: [
      { href: "/admin/menu",            icon: "🍔", label: "Platillos" },
      { href: "/admin/menu/categorias", icon: "📂", label: "Categorías" },
      { href: "/admin/menu/variantes",  icon: "🔀", label: "Variantes" },
      { href: "/admin/banners",         icon: "🖼️", label: "Banners" },
      { href: "/admin/inventario",      icon: "📦", label: "Inventario" },
    ],
  },
  {
    key: "staff",
    label: "Personal",
    icon: "👥",
    accent: "#8b5cf6",
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
    accent: "#22c55e",
    items: [
      { href: "/admin",                      icon: "📊", label: "Dashboard" },
      { href: "/admin/restaurant-dashboard", icon: "🍽️", label: "Rest. Dashboard" },
      { href: "/admin/clientes",             icon: "🏢", label: "Mi Marca" },
      { href: "/admin/reportes",             icon: "📈", label: "Reportes" },
      { href: "/admin/impresoras",           icon: "🖨️", label: "Impresoras" },
      { href: "/admin/integraciones",        icon: "🔌", label: "Integraciones" },
    ],
  },
];

export default function Sidebar() {
  const path = usePathname();
  const [user, setUser]             = useState<any>(null);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [locations, setLocations]   = useState<any[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [imgError, setImgError]     = useState(false);
  const [open, setOpen]             = useState<Record<string, boolean>>({});

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    setSuperAdmin(isSuperAdmin());
    if (currentUser) {
      api.get("/api/admin/locations").then(res => {
        setLocations(res.data);
        const saved = localStorage.getItem("locationId");
        if (saved) {
          setActiveLocationId(saved);
        } else if (res.data.length > 0) {
          localStorage.setItem("locationId", res.data[0].id);
          setActiveLocationId(res.data[0].id);
        }
      }).catch(() => {});
    }
    setOpen(getDefaultOpen());
  }, [path]);

  const handleLocationChange = (id: string) => {
    localStorage.setItem("locationId", id);
    setActiveLocationId(id);
    window.location.reload();
  };

  function getDefaultOpen() {
    const s: Record<string, boolean> = {};
    for (const section of SECTIONS) {
      s[section.key] = section.items.some(item =>
        item.href === "/admin" ? path === "/admin" : path.startsWith(item.href)
      );
    }
    if (!Object.values(s).some(Boolean)) s[SECTIONS[0].key] = true;
    return s;
  }

  function toggle(key: string) {
    setOpen(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "AD";

  return (
    <aside
      className="fixed left-0 top-0 h-full w-56 flex flex-col z-40"
      style={{
        background: "var(--surf)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* LOGO */}
      <div className="px-4 py-5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm"
            style={{ background: "linear-gradient(135deg,#ff5c35,#ff8c6b)" }}
          >
            {!imgError ? (
              <Image src="/logo.png" alt="Logo" width={36} height={36} className="rounded-xl object-cover" onError={() => setImgError(true)} />
            ) : <span className="text-[10px]">MB</span>}
          </div>
          <div>
            <div className="font-black text-xs leading-tight tracking-tighter" style={{ color: "var(--text)", fontFamily: "var(--font-display, sans-serif)" }}>
              MRTPV<span style={{ color: "#ff5c35" }}>REST</span>
            </div>
            <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "var(--muted)" }}>
              Control Panel
            </div>
          </div>
        </div>

        {/* SUCURSAL */}
        <div>
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5 ml-0.5" style={{ color: "var(--muted)" }}>
            Sucursal Activa
          </div>
          <div className="relative">
            <select
              value={activeLocationId}
              onChange={e => handleLocationChange(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none appearance-none cursor-pointer transition-all"
              style={{
                background: "var(--surf2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {locations.length === 0 && <option>Cargando...</option>}
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[8px]" style={{ color: "var(--muted)" }}>▼</div>
          </div>
        </div>
      </div>

      {/* NAV */}
      <nav className="flex-1 overflow-y-auto py-3 px-2" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map(section => {
          const isOpen = !!open[section.key];
          const hasActive = section.items.some(item =>
            item.href === "/admin" ? path === "/admin" : path.startsWith(item.href)
          );

          return (
            <div key={section.key} className="mb-1">
              <button
                onClick={() => toggle(section.key)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: hasActive ? `${section.accent}12` : "transparent",
                  border: `1px solid ${hasActive ? section.accent + "25" : "transparent"}`,
                }}
              >
                <span className="text-sm flex-shrink-0">{section.icon}</span>
                <span
                  className="flex-1 text-[10px] font-black uppercase tracking-widest"
                  style={{ color: hasActive ? section.accent : "var(--muted)" }}
                >
                  {section.label}
                </span>
                <span
                  className="text-[9px] transition-transform duration-200"
                  style={{
                    color: "var(--muted)",
                    display: "inline-block",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >▾</span>
              </button>

              {isOpen && (
                <div
                  className="ml-4 pl-3 mt-1 mb-2 flex flex-col gap-0.5"
                  style={{ borderLeft: `1px solid ${section.accent}25` }}
                >
                  {section.items.map(item => {
                    const active = item.href === "/admin"
                      ? path === "/admin"
                      : path.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all"
                        style={{
                          background: active ? `${section.accent}15` : "transparent",
                          color: active ? section.accent : "var(--muted)",
                        }}
                      >
                        <span className="text-xs opacity-70">{item.icon}</span>
                        <span>{item.label}</span>
                        {active && (
                          <span
                            className="ml-auto w-1 h-1 rounded-full flex-shrink-0"
                            style={{ background: section.accent }}
                          />
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* SUPER ADMIN */}
        {superAdmin && (
          <div className="mt-2 mx-0">
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(255,92,53,0.2)" }}
            >
              <button
                onClick={() => toggle("saas")}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-all"
                style={{ background: path.startsWith("/dashboard") ? "rgba(255,92,53,0.08)" : "transparent" }}
              >
                <span className="text-sm">🏢</span>
                <span className="flex-1 text-[10px] font-black uppercase tracking-widest" style={{ color: "#ff5c35" }}>
                  MRTPVREST
                </span>
                <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: "#ff5c35", color: "#fff" }}>SA</span>
              </button>
              {open["saas"] && (
                <div className="ml-4 pl-3 flex flex-col gap-0.5 pb-2" style={{ borderLeft: "1px solid rgba(255,92,53,0.2)" }}>
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[11px] font-bold transition-all"
                    style={{
                      color: path === "/dashboard" ? "#ff5c35" : "var(--muted)",
                      background: path === "/dashboard" ? "rgba(255,92,53,0.1)" : "transparent",
                    }}
                  >
                    <span className="text-xs opacity-70">🏪</span>
                    <span>Tenants / MRR</span>
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}
      </nav>

      {/* USER FOOTER */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#ff5c35,#ff8c6b)" }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-bold truncate" style={{ color: "var(--text)" }}>
                {user?.name || "Admin"}
              </div>
              <div className="text-[9px] truncate" style={{ color: "var(--muted)" }}>
                {user?.email}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2.5 px-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--muted)" }}>Tema</span>
            <ThemeToggle size="sm" />
          </div>

          <button
            onClick={logout}
            className="w-full text-[10px] font-black py-2 rounded-lg uppercase tracking-widest transition-all"
            style={{
              background: "rgba(239,68,68,0.08)",
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.15)",
            }}
          >
            Salir del sistema
          </button>
        </div>
      </div>
    </aside>
  );
}
