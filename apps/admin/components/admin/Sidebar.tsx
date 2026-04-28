"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout, getUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import api from "@/lib/api";

// ── SVG Icon system ───────────────────────────────────────────
type IconProps = { size?: number };
const ic = (children: React.ReactNode, size = 14) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);

const IBarChart  = ({ size }: IconProps) => ic(<><rect x="1" y="9" width="3" height="5" rx="0.5"/><rect x="6.5" y="5.5" width="3" height="8.5" rx="0.5"/><rect x="12" y="2" width="3" height="12" rx="0.5"/></>, size);
const IGrid      = ({ size }: IconProps) => ic(<><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></>, size);
const IUniverse  = ({ size }: IconProps) => ic(<><path d="M3 3h3v3H3zM10 3h3v3h-3zM3 10h3v3H3z"/><circle cx="11.5" cy="11.5" r="2.5"/><line x1="13.3" y1="13.3" x2="15" y2="15"/></>, size);
const IBuilding  = ({ size }: IconProps) => ic(<><rect x="2" y="3" width="12" height="11" rx="1"/><rect x="5" y="9" width="2" height="5"/><rect x="9" y="9" width="2" height="5"/><rect x="5" y="5" width="2" height="2"/><rect x="9" y="5" width="2" height="2"/></>, size);
const ITrending  = ({ size }: IconProps) => ic(<><polyline points="1 10 5 6 9 8 14 3"/><polyline points="10 3 14 3 14 7"/></>, size);
const IPlug      = ({ size }: IconProps) => ic(<><path d="M5 2v5M11 2v5"/><path d="M4 7h8a1 1 0 011 1v1.5a5 5 0 01-10 0V8a1 1 0 011-1z"/><line x1="8" y1="14.5" x2="8" y2="16"/></>, size);
const IUtensils  = ({ size }: IconProps) => ic(<><path d="M3 2v5M3 7a2 2 0 002 2v5M9 2v12M11 2v4.5a2.5 2.5 0 005 0V2"/></>, size);
const IFolder    = ({ size }: IconProps) => ic(<><path d="M2 5.5c0-1.1.9-2 2-2h2.2L8 5.5h6a1 1 0 011 1V12a1 1 0 01-1 1H4a2 2 0 01-2-2V5.5z"/></>, size);
const ISliders   = ({ size }: IconProps) => ic(<><line x1="4" y1="1" x2="4" y2="15"/><line x1="8" y1="1" x2="8" y2="15"/><line x1="12" y1="1" x2="12" y2="15"/><circle cx="4" cy="9" r="1.5" fill="currentColor" stroke="none"/><circle cx="8" cy="5" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r="1.5" fill="currentColor" stroke="none"/></>, size);
const IImage     = ({ size }: IconProps) => ic(<><rect x="1" y="3" width="14" height="10" rx="1"/><circle cx="5" cy="7.5" r="1.5"/><path d="M1 11l3.5-3.5 2.5 2.5 2.5-2.5 5 5"/></>, size);
const IBox       = ({ size }: IconProps) => ic(<><path d="M13 4.5L8 1.5 3 4.5l5 3 5-3zM3 4.5v6l5 3 5-3v-6M8 7.5v6"/></>, size);
const IUsers     = ({ size }: IconProps) => ic(<><circle cx="6" cy="6" r="3"/><path d="M1 14v-1a5 5 0 0110 0v1"/><path d="M15 14v-.7a3 3 0 00-4-2.8"/><circle cx="13" cy="5.5" r="2.5"/></>, size);
const IClock     = ({ size }: IconProps) => ic(<><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></>, size);
const IWallet    = ({ size }: IconProps) => ic(<><rect x="1" y="5" width="14" height="9" rx="1"/><path d="M4 5V4a2 2 0 012-2h7a2 2 0 012 2v1"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/></>, size);
const IMapPin    = ({ size }: IconProps) => ic(<><path d="M8 14s5-4 5-8A5 5 0 003 6c0 4 5 8 5 8z"/><circle cx="8" cy="6" r="2"/></>, size);
const ILayoutDash = ({ size }: IconProps) => ic(<><rect x="1" y="1" width="6" height="8" rx="1"/><rect x="9" y="1" width="6" height="4" rx="1"/><rect x="9" y="7" width="6" height="8" rx="1"/><rect x="1" y="11" width="6" height="4" rx="1"/></>, size);
const IPuzzle    = ({ size }: IconProps) => ic(<><path d="M6 2h4v2a1 1 0 001 1h2v4h-2a1 1 0 00-1 1v2H6v-2a1 1 0 00-1-1H3V5h2a1 1 0 001-1V2z"/></>, size);
const ICreditCard= ({ size }: IconProps) => ic(<><rect x="1" y="3" width="14" height="10" rx="1.5"/><line x1="1" y1="6.5" x2="15" y2="6.5"/><line x1="4" y1="10.5" x2="7" y2="10.5"/></>, size);

// ── Nav sections ──────────────────────────────────────────────
const SECTIONS = [
  {
    key: "bo",
    label: "Back Office",
    icon: <IBarChart />,
    accent: "#22c55e",
    items: [
      { href: "/admin/restaurant-dashboard", icon: <IGrid />,      label: "Dashboard" },
      { href: "/admin/mi-marca",             icon: <IBuilding />,  label: "Mi Marca" },
      { href: "/admin/reportes",             icon: <ITrending />,  label: "Reportes" },
      { href: "/admin/reportes/ia",          icon: <ILayoutDash />, label: "Reportes IA ✦" },
      { href: "/admin/integraciones",        icon: <IPlug />,      label: "Integraciones" },
      { href: "/admin/modulos",             icon: <IPuzzle />,    label: "Módulos" },
      { href: "/admin/billing",              icon: <ICreditCard />, label: "Facturación" },
    ],
  },
  {
    key: "menu",
    label: "Menú",
    icon: <IUtensils />,
    accent: "#3b82f6",
    items: [
      { href: "/admin/menu",            icon: <IUtensils />, label: "Platillos" },
      { href: "/admin/menu/categorias", icon: <IFolder />,   label: "Categorías" },
      { href: "/admin/menu/variantes",  icon: <ISliders />,  label: "Variantes" },
      { href: "/admin/banners",         icon: <IImage />,    label: "Banners" },
      { href: "/admin/inventario",      icon: <IBox />,      label: "Inventario" },
    ],
  },
  {
    key: "staff",
    label: "Personal",
    icon: <IUsers />,
    accent: "#8b5cf6",
    items: [
      { href: "/admin/empleados",         icon: <IUsers />,  label: "Empleados" },
      { href: "/admin/turnos",            icon: <IClock />,  label: "Turnos de caja" },
      { href: "/admin/caja-repartidores", icon: <IWallet />, label: "Caja Rep." },
      { href: "/admin/rastreo",           icon: <IMapPin />, label: "Rastreo GPS" },
      { href: "/admin/logistica",         icon: <IMapPin />, label: "Logística & Flota" },
    ],
  },
  // NOTA: la sección "Plataforma / Super-admin" vive en apps/saas
  // (saas.mrtpvrest.com). El middleware de admin redirige a SUPER_ADMIN
  // fuera de esta app al loguearse, así que no se renderiza nada aquí.
];

// ─────────────────────────────────────────────────────────────

type SidebarProps = { isOpen?: boolean; onClose?: () => void };

export default function Sidebar({ isOpen = true, onClose }: SidebarProps = {}) {
  const path = usePathname();
  const [user, setUser]             = useState<any>(null);
  const [locations, setLocations]   = useState<any[]>([]);
  const [brands, setBrands]         = useState<any[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [activeBrandId, setActiveBrandId]       = useState<string>("");
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [imgError, setImgError]     = useState(false);
  const [open, setOpen]             = useState<Record<string, boolean>>({});
  const [brand, setBrand]           = useState<{ name: string; logoUrl: string | null }>({ name: "", logoUrl: null });

  useEffect(() => {
    const currentUser = getUser();
    setUser(currentUser);
    if (currentUser) {
      // 1. Cargar contexto de Tenant y sus marcas
      (async () => {
        try {
          const { data: tenant } = await api.get("/api/tenant/me");
          const restaurantList = tenant.restaurants || [];
          setBrands(restaurantList);
          
          const currentBrandId = localStorage.getItem("restaurantId");
          if (currentBrandId && restaurantList.some((r: any) => r.id === currentBrandId)) {
            setActiveBrandId(currentBrandId);
          } else if (restaurantList.length > 0) {
            const firstId = restaurantList[0].id;
            localStorage.setItem("restaurantId", firstId);
            setActiveBrandId(firstId);
          }
        } catch {
          setBrands([]);
        }
      })();

      // 2. Cargar sucursales de la marca activa
      (async () => {
        try {
          const { data } = await api.get("/api/admin/locations");
          const list = Array.isArray(data) ? data : [];
          setLocations(list);
          const saved = localStorage.getItem("locationId");
          if (saved && list.some((l: any) => l.id === saved)) {
            setActiveLocationId(saved);
          } else if (list.length > 0) {
            localStorage.setItem("locationId", list[0].id);
            setActiveLocationId(list[0].id);
          }
        } catch {
          setLocations([]);
        } finally {
          setIsLoadingLocations(false);
        }
      })();

      // 3. Cargar configuración visual de la marca
      (async () => {
        try {
          const { data } = await api.get("/api/admin/config");
          setBrand({ name: data.name || "", logoUrl: data.logoUrl || null });
        } catch {
          /* sin config todavía */
        }
      })();
    } else {
      setIsLoadingLocations(false);
    }
    setOpen(getDefaultOpen());
  }, [path]);

  const handleBrandChange = (id: string) => {
    localStorage.setItem("restaurantId", id);
    localStorage.removeItem("locationId"); // Forzar recarga de sucursales de la nueva marca
    setActiveBrandId(id);
    window.location.reload();
  };

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
    const firstKey = SECTIONS[0]?.key;
    if (!Object.values(s).some(Boolean) && firstKey) s[firstKey] = true;
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
      className={`fixed left-0 top-0 h-full w-56 flex flex-col z-40 transition-transform duration-200 md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ background: "var(--surf)", borderRight: "1px solid var(--border)" }}
    >
      {/* ── Logo + sucursal ── */}
      <div className="px-4 py-5 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white font-black text-sm overflow-hidden"
            style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))" }}
          >
            {brand.logoUrl && !imgError ? (
              <Image src={brand.logoUrl} alt="Logo" width={36} height={36} className="rounded-xl object-cover w-full h-full" onError={() => setImgError(true)} />
            ) : (
              <span className="text-[10px]">{brand.name ? brand.name.slice(0, 2).toUpperCase() : "MR"}</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-black text-xs leading-tight tracking-tighter truncate" style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}>
              {brand.name || <span>MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span></span>}
            </div>
            <div className="text-[9px] font-bold tracking-widest uppercase" style={{ color: "var(--muted)" }}>
              Control Panel
            </div>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar menú"
              className="md:hidden ml-auto w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "var(--surf2)", border: "1px solid var(--border)", color: "var(--muted)" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="3" y1="3" x2="13" y2="13"/>
                <line x1="13" y1="3" x2="3" y2="13"/>
              </svg>
            </button>
          )}
        </div>

        {/* Brand Selector (Solo si tiene > 1 marca) */}
        {brands.length > 1 && (
          <div className="px-4 mb-4">
            <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted)" }}>
              Marca / Restaurante
            </div>
            <div className="relative">
              <select
                value={activeBrandId}
                onChange={e => handleBrandChange(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none appearance-none cursor-pointer"
                style={{
                  background: "var(--surf2)",
                  border: "1px solid var(--brand-primary, #7c3aed)44",
                  color: "var(--text)",
                }}
              >
                {brands.map(b => (
                  <option key={b.id} value={b.id}>🏠 {b.name}</option>
                ))}
              </select>
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--brand-primary)", fontSize: 8 }}>▼</div>
            </div>
          </div>
        )}

        {/* Sucursal selector */}
        <div className="px-4">
          <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "var(--muted)" }}>
            Sucursal activa
          </div>
          <div className="relative">
            <select
              value={activeLocationId}
              onChange={e => handleLocationChange(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-xs font-bold outline-none appearance-none cursor-pointer"
              style={{
                background: "var(--surf2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            >
              {isLoadingLocations && <option>Cargando...</option>}
              {!isLoadingLocations && locations.length === 0 && <option>Sin sucursales</option>}
              {locations.map(loc => (
                <option key={loc.id} value={loc.id}>📍 {loc.name}</option>
              ))}
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)", fontSize: 8 }}>▼</div>
          </div>
          <Link
            href="/admin/configurar-negocio"
            className="mt-2 flex items-center justify-center gap-1.5 w-full rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
            style={{
              background: locations.length === 0 && !isLoadingLocations ? "var(--brand-primary, #7c3aed)" : "transparent",
              color: locations.length === 0 && !isLoadingLocations ? "#fff" : "var(--brand-primary, #7c3aed)",
              border: `1px dashed ${locations.length === 0 && !isLoadingLocations ? "transparent" : "var(--brand-primary, #7c3aed)"}`,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            <span>Añadir sucursal</span>
          </Link>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 overflow-y-auto py-2 px-2" style={{ scrollbarWidth: "none" }}>
        {SECTIONS.map(section => {
          const isOpen = !!open[section.key];
          const hasActive = section.items.some(item =>
            item.href === "/admin" ? path === "/admin" : path.startsWith(item.href)
          );

          return (
            <div key={section.key} className="mb-0.5">
              {/* Section header */}
              <button
                onClick={() => toggle(section.key)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all"
                style={{
                  background: hasActive ? `${section.accent}12` : "transparent",
                  border: `1px solid ${hasActive ? section.accent + "22" : "transparent"}`,
                }}
              >
                <span
                  className="flex-shrink-0 inline-flex transition-transform duration-200 hover:scale-110 active:scale-95"
                  style={{ color: hasActive ? section.accent : "var(--muted)", opacity: 0.8 }}
                >
                  {section.icon}
                </span>
                <span
                  className="flex-1 text-[10px] font-black uppercase tracking-widest"
                  style={{ color: hasActive ? section.accent : "var(--muted)" }}
                >
                  {section.label}
                </span>
                <span
                  className="text-[9px] transition-transform duration-200 inline-block"
                  style={{
                    color: "var(--muted)",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >▾</span>
              </button>

              {/* Items */}
              {isOpen && (
                <div
                  className="ml-4 pl-3 mt-0.5 mb-1.5 flex flex-col gap-0.5"
                  style={{ borderLeft: `1px solid ${section.accent}22` }}
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
                        <span
                          className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95"
                          style={{ opacity: active ? 1 : 0.6, flexShrink: 0, color: active ? section.accent : "currentColor" }}
                        >
                          {item.icon}
                        </span>
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

      </nav>

      {/* ── User footer ── */}
      <div className="p-3 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <div
          className="rounded-xl p-3"
          style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[11px] font-black flex-shrink-0"
              style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))" }}
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
            <ThemeToggle />
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
