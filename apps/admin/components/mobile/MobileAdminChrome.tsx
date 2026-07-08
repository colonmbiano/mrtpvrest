"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell, ChevronDown, CircleUserRound, Home, Menu as MenuIcon,
  MoreHorizontal, PackageOpen, ReceiptText, UsersRound, X,
} from "lucide-react";
import api from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { AdminBrandConfig, AdminLocation, AdminUser } from "@/types/admin";

const tabs = [
  { href: "/admin", label: "Inicio", icon: Home, match: (path: string) => path === "/admin" },
  { href: "/admin/pedidos", label: "Pedidos", icon: ReceiptText, match: (path: string) => path.startsWith("/admin/pedidos") },
  { href: "/admin/menu", label: "Menú", icon: PackageOpen, match: (path: string) => path.startsWith("/admin/menu") },
  { href: "/admin/empleados", label: "Personal", icon: UsersRound, match: (path: string) => path.startsWith("/admin/empleados") || path.startsWith("/admin/turnos") },
] as const;

const moreGroups = [
  { label: "Negocio", items: [["/admin/mi-marca", "Mi Marca"], ["/admin/tienda", "Tienda online"], ["/admin/pantalla-cliente", "Pantalla cliente"]] },
  { label: "Operación", items: [["/admin/inventario", "Inventario"], ["/admin/inventario/compras", "Compras & Bodega"], ["/admin/rastreo", "Logística & Flota"], ["/admin/caja-repartidores", "Caja repartidores"], ["/admin/nomina", "Nómina"], ["/admin/reportes/cortes", "Cortes"]] },
  { label: "Crecimiento", items: [["/admin/reportes/ia", "Reportes IA"], ["/admin/promociones", "Promociones IA"], ["/admin/inbox", "Bandeja de entrada"], ["/admin/whatsapp", "WhatsApp Bot"], ["/admin/banners", "Banners"]] },
  { label: "Cuenta", items: [["/admin/modulos", "Módulos"], ["/admin/integraciones", "Integraciones"], ["/admin/billing", "Facturación"], ["/admin/descargas", "Apps & Descargas"]] },
] as const;

const routeTitles: Array<[string, string, string]> = [
  ["/admin/pedidos", "Pedidos", "Operación en vivo"],
  ["/admin/menu", "Menú", "Platillos y categorías"],
  ["/admin/empleados", "Personal", "Equipo y permisos"],
  ["/admin/turnos", "Caja & Turnos", "Control operativo"],
  ["/admin/inventario", "Inventario", "Stock y compras"],
  ["/admin/reportes/ia", "Reportes IA", "Mesero analiza tu negocio"],
  ["/admin/promociones", "Promociones IA", "Campañas y rendimiento"],
  ["/admin/inbox", "Bandeja de entrada", "Conversaciones de WhatsApp"],
  ["/admin/whatsapp", "WhatsApp Bot", "Conversaciones y pedidos"],
  ["/admin/banners", "Banners", "Promociones visuales"],
  ["/admin/rastreo", "Logística & Flota", "Rastreo en vivo"],
  ["/admin/caja-repartidores", "Caja repartidores", "Liquidaciones"],
  ["/admin/nomina", "Nómina", "La raya: pago por día trabajado"],
  ["/admin/reportes/cortes", "Cortes", "Cierres de caja"],
  ["/admin/integraciones", "Integraciones", "Servicios conectados"],
  ["/admin/modulos", "Módulos", "Funciones del negocio"],
  ["/admin/billing", "Facturación", "Plan y pagos"],
  ["/admin/descargas", "Apps & Descargas", "Herramientas del equipo"],
  ["/admin/mi-marca", "Mi Marca", "Identidad del restaurante"],
  ["/admin/tienda", "Tienda online", "Canal de venta digital"],
  ["/admin/pantalla-cliente", "Pantalla cliente", "Display de pedidos"],
];

export default function MobileAdminChrome() {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [user, setUser] = useState<AdminUser | null>(null);
  const [brand, setBrand] = useState<AdminBrandConfig>({ name: "MRTPVREST", logoUrl: null });
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [locationId, setLocationId] = useState("");

  useEffect(() => {
    setUser(getUser() as AdminUser | null);
    setMoreOpen(false);
    setLocationOpen(false);
  }, [pathname]);

  useEffect(() => {
    Promise.all([
      api.get<AdminBrandConfig>("/api/admin/config").catch(() => null),
      api.get<AdminLocation[]>("/api/admin/locations").catch(() => null),
    ]).then(([brandResponse, locationResponse]) => {
      if (brandResponse?.data) setBrand(brandResponse.data);
      const list = Array.isArray(locationResponse?.data) ? locationResponse.data : [];
      setLocations(list);
      const saved = localStorage.getItem("locationId");
      setLocationId(saved && list.some((location) => location.id === saved) ? saved : list[0]?.id || "");
    });
  }, []);

  const locationName = locations.find((location) => location.id === locationId)?.name || "Sucursal";
  const title = useMemo(() => {
    if (pathname === "/admin") return [`Hola, ${user?.name?.split(" ")[0] || "Andrea"}`, "Aquí está tu resumen de hoy"] as const;
    const match = routeTitles.find(([prefix]) => pathname.startsWith(prefix));
    return match ? [match[1], match[2]] as const : undefined;
  }, [pathname, user?.name]);
  const initials = user?.name ? user.name.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase() : "AD";

  function changeLocation(nextId: string) {
    localStorage.setItem("locationId", nextId);
    setLocationId(nextId);
    setLocationOpen(false);
    window.dispatchEvent(new Event("locationChanged"));
    router.refresh();
  }

  return (
    <>
      <header className="md:hidden sticky top-0 z-30 px-[18px] pt-[max(12px,env(safe-area-inset-top))] pb-2.5" style={{ background: "var(--bg)", borderBottom: "1px solid var(--bd-1)" }}>
        <div className="flex items-center gap-3">
          <Link href="/admin" aria-label="Ir al inicio" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-[13px] font-extrabold" style={{ color: "#fffaf4", background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 4px 14px var(--iris-glow)" }}>
            {brand.name ? brand.name.slice(0, 2).toUpperCase() : "MR"}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[15px] font-extrabold leading-tight text-tx-hi">{brand.name || "MRTPVREST"}</div>
            <button type="button" onClick={() => setLocationOpen((open) => !open)} className="mt-1 flex min-h-6 items-center gap-1 text-[11px] font-semibold text-tx-mut" aria-expanded={locationOpen}>
              <span className="max-w-[160px] truncate">{locationName}</span><ChevronDown size={13} aria-hidden="true" />
            </button>
          </div>
          <Link href="/admin/pedidos" aria-label="Ver pedidos y notificaciones" className="relative grid h-11 w-11 place-items-center rounded-[13px] text-tx-mid" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <Bell size={19} strokeWidth={1.8} />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-primary ring-2" style={{ "--tw-ring-color": "var(--surf-2)" } as React.CSSProperties} />
          </Link>
          <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-info text-xs font-extrabold text-white" aria-label={user?.name || "Usuario"}>
            {initials || <CircleUserRound size={18} />}
          </div>
        </div>

        {locationOpen && (
          <div className="absolute left-[70px] right-[86px] top-[62px] z-40 overflow-hidden rounded-2xl p-1 shadow-xl warmtech-card">
            {locations.length === 0 ? <div className="px-3 py-3 text-xs text-tx-mut">Sin sucursales disponibles</div> : locations.map((location) => (
              <button key={location.id} type="button" onClick={() => changeLocation(location.id)} className="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-xs font-semibold text-tx">{location.name}</button>
            ))}
          </div>
        )}

        {title && <div className="mt-3"><h1 className="font-display text-[22px] font-extrabold leading-none tracking-[-.025em] text-tx-hi">{title[0]}</h1><p className="mt-1 text-[11px] text-tx-mut">{title[1]}</p></div>}
      </header>

      <nav className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t px-1 pt-2" style={{ background: "var(--surf-1)", borderColor: "var(--bd-1)", paddingBottom: "max(10px,env(safe-area-inset-bottom))", boxShadow: "0 -8px 24px rgba(0,0,0,.14)" }} aria-label="Navegación principal">
        <div className="flex">
          {tabs.map((tab) => {
            const active = tab.match(pathname);
            const Icon = tab.icon;
            return <Link key={tab.href} href={tab.href} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl font-mono text-[9px] font-bold" style={{ color: active ? "var(--brand-primary)" : "var(--tx-dim)" }}><span className="relative grid place-items-center">{active && <span className="absolute -inset-2 rounded-xl" style={{ background: "var(--iris-soft)" }} />}<Icon className="relative" size={21} strokeWidth={active ? 2.2 : 1.8} /></span>{tab.label}</Link>;
          })}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex min-h-12 flex-1 flex-col items-center justify-center gap-1 rounded-xl font-mono text-[9px] font-bold text-tx-dim" aria-expanded={moreOpen}><MoreHorizontal size={21} strokeWidth={1.8} />Más</button>
        </div>
      </nav>

      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex items-end">
          <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-label="Cerrar menú" />
          <section className="warmtech-enter relative max-h-[86vh] w-full overflow-y-auto rounded-t-[28px] px-[18px] pb-[max(26px,env(safe-area-inset-bottom))] pt-4 warmtech-scrollbar" style={{ background: "var(--bg)", borderTop: "1px solid var(--bd-2)" }}>
            <div className="mb-4 flex items-center justify-between">
              <div><div className="font-display text-xl font-extrabold text-tx-hi">Más herramientas</div><div className="mt-1 text-xs text-tx-mut">Todo tu restaurante, a un toque</div></div>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Cerrar menú" className="grid h-11 w-11 place-items-center rounded-xl text-tx-mid" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}><X size={19} /></button>
            </div>
            {moreGroups.map((group) => (
              <div key={group.label} className="mb-5">
                <div className="mb-2 px-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">{group.label}</div>
                <div className="overflow-hidden warmtech-card">
                  {group.items.map(([href, label], index) => <Link key={href} href={href} className="flex min-h-14 items-center gap-3 px-4 text-[13px] font-semibold text-tx" style={{ borderBottom: index < group.items.length - 1 ? "1px solid var(--bd-1)" : "none" }}><span className="grid h-9 w-9 place-items-center rounded-[10px] text-primary" style={{ background: "var(--iris-soft)" }}><MenuIcon size={17} /></span><span className="flex-1">{label}</span><ChevronDown className="-rotate-90 text-tx-dim" size={16} /></Link>)}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
