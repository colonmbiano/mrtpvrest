"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown, Plus, X } from "lucide-react";
import { logout, getUser } from "@/lib/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import api from "@/lib/api";
import { NAV_TOP, NAV_GROUPS, isNavItemActive } from "@/lib/nav";
import type {
  AdminUser,
  AdminRestaurant,
  AdminLocation,
  AdminBrandConfig,
  TenantMeResponse,
} from "@/types/admin";

const NAV_OPEN_KEY = "mb-nav-open";

type SidebarProps = { isOpen?: boolean; onClose?: () => void };

export default function Sidebar({ isOpen = true, onClose }: SidebarProps = {}) {
  const path = usePathname();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [locations, setLocations] = useState<AdminLocation[]>([]);
  const [brands, setBrands] = useState<AdminRestaurant[]>([]);
  const [activeLocationId, setActiveLocationId] = useState<string>("");
  const [activeBrandId, setActiveBrandId] = useState<string>("");
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [brand, setBrand] = useState<AdminBrandConfig>({ name: "", logoUrl: null });

  useEffect(() => {
    const currentUser = getUser() as AdminUser | null;
    setUser(currentUser);
    if (currentUser) {
      // 1. Cargar contexto de Tenant y sus marcas
      (async () => {
        try {
          const { data: tenant } = await api.get<TenantMeResponse>("/api/tenant/me");
          const restaurantList = tenant.restaurants || [];
          setBrands(restaurantList);

          const currentBrandId = localStorage.getItem("restaurantId");
          if (currentBrandId && restaurantList.some((r) => r.id === currentBrandId)) {
            setActiveBrandId(currentBrandId);
          } else if (restaurantList.length > 0) {
            const firstId = restaurantList[0]?.id;
            if (firstId) {
              localStorage.setItem("restaurantId", firstId);
              setActiveBrandId(firstId);
            }
          }
        } catch {
          setBrands([]);
        }
      })();

      // 2. Cargar sucursales de la marca activa
      (async () => {
        try {
          const { data } = await api.get<AdminLocation[]>("/api/admin/locations");
          const list: AdminLocation[] = Array.isArray(data) ? data : [];
          setLocations(list);
          const saved = localStorage.getItem("locationId");
          if (saved && list.some((l) => l.id === saved)) {
            setActiveLocationId(saved);
            // Notificar que el contexto de sucursal ya está listo
            window.dispatchEvent(new Event("locationChanged"));
          } else if (list.length > 0) {
            const firstLocId = list[0]?.id;
            if (firstLocId) {
              localStorage.setItem("locationId", firstLocId);
              setActiveLocationId(firstLocId);
              // Notificar que el contexto de sucursal ya está listo (primera carga)
              window.dispatchEvent(new Event("locationChanged"));
            }
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
          const { data } = await api.get<AdminBrandConfig & Record<string, unknown>>("/api/admin/config");
          setBrand({ name: data.name || "", logoUrl: data.logoUrl || null });
        } catch {
          /* sin config todavía */
        }
      })();
    } else {
      setIsLoadingLocations(false);
    }
  }, [path]);

  // Grupos abiertos: persistidos + siempre abierto el grupo de la ruta activa.
  useEffect(() => {
    let saved: Record<string, boolean> = {};
    try {
      saved = JSON.parse(localStorage.getItem(NAV_OPEN_KEY) || "{}");
    } catch {
      /* estado corrupto → default */
    }
    const next = { ...saved };
    for (const group of NAV_GROUPS) {
      if (group.items.some((item) => isNavItemActive(item, path))) next[group.key] = true;
    }
    setOpen(next);
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

  function toggle(key: string) {
    setOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(NAV_OPEN_KEY, JSON.stringify(next));
      } catch {
        /* storage lleno/bloqueado: solo estado en memoria */
      }
      return next;
    });
  }

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "AD";

  const selectStyle: React.CSSProperties = {
    background: "var(--sb-surf)",
    border: "1px solid var(--sb-bd)",
    color: "var(--sb-tx)",
  };

  return (
    <aside
      className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col transition-transform duration-200 md:translate-x-0 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ background: "var(--sb-bg)", borderRight: "1px solid var(--sb-bd)" }}
    >
      {/* ── Marca + selectores de contexto ── */}
      <div className="flex-shrink-0 px-4 pb-4 pt-5" style={{ borderBottom: "1px solid var(--sb-bd)" }}>
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-black"
            style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))", color: "var(--accent-contrast)" }}
          >
            {brand.logoUrl && !imgError ? (
              <Image src={brand.logoUrl} alt="Logo" width={36} height={36} className="h-full w-full rounded-xl object-cover" onError={() => setImgError(true)} />
            ) : (
              <span className="text-[10px]">{brand.name ? brand.name.slice(0, 2).toUpperCase() : "MR"}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-xs font-extrabold leading-tight" style={{ color: "var(--sb-tx)" }}>
              {brand.name || <span>MRTPV<span style={{ color: "var(--brand-primary)" }}>REST</span></span>}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--sb-mut)" }}>
              Panel de control
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar menú"
              className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg md:hidden"
              style={{ ...selectStyle, color: "var(--sb-mut)" }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Selector de marca (solo si tiene > 1) */}
        {brands.length > 1 && (
          <div className="mb-3">
            <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--sb-mut)" }}>
              Marca / Restaurante
            </div>
            <div className="relative">
              <select
                value={activeBrandId}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="w-full cursor-pointer appearance-none rounded-lg px-3 py-2 text-xs font-bold outline-none"
                style={selectStyle}
              >
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>🏠 {b.name}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--brand-primary)" }} />
            </div>
          </div>
        )}

        {/* Selector de sucursal */}
        <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--sb-mut)" }}>
          Sucursal activa
        </div>
        <div className="relative">
          <select
            value={activeLocationId}
            onChange={(e) => handleLocationChange(e.target.value)}
            className="w-full cursor-pointer appearance-none rounded-lg px-3 py-2 text-xs font-bold outline-none"
            style={selectStyle}
          >
            {isLoadingLocations && <option>Cargando...</option>}
            {!isLoadingLocations && locations.length === 0 && <option>Sin sucursales</option>}
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>📍 {loc.name}</option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--sb-mut)" }} />
        </div>
        <Link
          href="/admin/configurar-negocio"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
          style={
            locations.length === 0 && !isLoadingLocations
              ? { background: "var(--brand-primary)", color: "var(--accent-contrast)", border: "1px dashed transparent" }
              : { background: "transparent", color: "var(--brand-primary)", border: "1px dashed var(--brand-primary)" }
          }
        >
          <Plus size={13} />
          <span>Añadir sucursal</span>
        </Link>
      </div>

      {/* ── Navegación ── */}
      <nav className="ds-scrollbar flex-1 overflow-y-auto px-2 py-3">
        {/* Nivel raíz: Inicio, Pedidos */}
        <div className="mb-2 flex flex-col gap-0.5">
          {NAV_TOP.map((item) => {
            const active = isNavItemActive(item, path);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12px] font-bold transition-all"
                style={{
                  background: active ? "var(--accent-soft)" : "transparent",
                  color: active ? "var(--brand-primary)" : "var(--sb-mut)",
                }}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full" style={{ background: "var(--brand-primary)" }} />
                )}
                <Icon size={15} strokeWidth={active ? 2.2 : 1.8} className="flex-shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge === "live" && (
                  <span className="animate-pulse h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: "var(--brand-primary)" }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Grupos por dominio */}
        {NAV_GROUPS.map((group) => {
          const isGroupOpen = !!open[group.key];
          const hasActive = group.items.some((item) => isNavItemActive(item, path));
          const GroupIcon = group.icon;

          return (
            <div key={group.key} className="mb-0.5">
              <button
                onClick={() => toggle(group.key)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all"
                style={{ color: hasActive ? "var(--sb-tx)" : "var(--sb-mut)" }}
              >
                <GroupIcon size={14} strokeWidth={hasActive ? 2.2 : 1.8} className="flex-shrink-0 opacity-80" />
                <span className="flex-1 text-[10px] font-black uppercase tracking-widest">{group.label}</span>
                <ChevronDown
                  size={12}
                  className="inline-block transition-transform duration-200"
                  style={{ color: "var(--sb-dim)", transform: isGroupOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>

              {isGroupOpen && (
                <div className="mb-1.5 ml-4 mt-0.5 flex flex-col gap-0.5 pl-3" style={{ borderLeft: "1px solid var(--sb-bd)" }}>
                  {group.items.map((item) => {
                    const active = isNavItemActive(item, path);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[11px] font-bold transition-all"
                        style={{
                          background: active ? "var(--accent-soft)" : "transparent",
                          color: active ? "var(--brand-primary)" : "var(--sb-mut)",
                        }}
                      >
                        {active && (
                          <span className="absolute -left-[13px] top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full" style={{ background: "var(--brand-primary)" }} />
                        )}
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

      {/* ── Footer de usuario ── */}
      <div className="flex-shrink-0 p-3" style={{ borderTop: "1px solid var(--sb-bd)" }}>
        <div className="rounded-xl p-3" style={selectStyle}>
          <div className="mb-3 flex items-center gap-2.5">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-black"
              style={{ background: "linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))", color: "var(--accent-contrast)" }}
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-bold" style={{ color: "var(--sb-tx)" }}>
                {user?.name || "Admin"}
              </div>
              <div className="truncate text-[9px]" style={{ color: "var(--sb-mut)" }}>
                {user?.email}
              </div>
            </div>
          </div>

          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "var(--sb-mut)" }}>Tema</span>
            <ThemeToggle />
          </div>

          <button
            onClick={logout}
            className="w-full rounded-lg py-2 text-[10px] font-black uppercase tracking-widest transition-all"
            style={{ background: "var(--err-soft)", color: "var(--err)", border: "1px solid var(--err-soft)" }}
          >
            Salir del sistema
          </button>
        </div>
      </div>
    </aside>
  );
}
