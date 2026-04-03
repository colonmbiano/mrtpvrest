"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { logout, getUser } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";

const NAV = [
  // ── TPV ──────────────────────────────
  { href: "/admin/tpv",                icon: "🖥️",  label: "TPV",              section: "tpv" },
  { href: "/admin/pedidos",            icon: "📋",  label: "Pedidos",          section: "tpv" },
  { href: "/admin/meseros",            icon: "🧑‍🍳",  label: "Meseros",          section: "tpv" },
  // ── MENÚ ─────────────────────────────
  { href: "/admin/menu",               icon: "🍔",  label: "Menú",             section: "menu" },
 { href: "/admin/menu/categorias",    icon: "📂",  label: "Categorías",       section: "menu" },
 { href: "/admin/menu/variantes", icon: "🔀", label: "Variantes", section: "menu" }, 
 { href: "/admin/banners",            icon: "🖼️",  label: "Banners",          section: "menu" },
  { href: "/admin/inventario",         icon: "📦",  label: "Inventario",       section: "menu" },
  // ── PERSONAL ─────────────────────────
  { href: "/admin/empleados",          icon: "👥",  label: "Empleados",        section: "staff" },
  { href: "/admin/caja-repartidores",  icon: "💵",  label: "Caja Rep.",        section: "staff" },
  { href: "/admin/rastreo",            icon: "📍",  label: "Rastreo GPS",      section: "staff" },
  // ── BACK OFFICE ──────────────────────
  { href: "/admin",                    icon: "📊",  label: "Dashboard",        section: "bo" },
  { href: "/admin/clientes",           icon: "🧑‍💼",  label: "Clientes",         section: "bo" },
  { href: "/admin/reportes",           icon: "📈",  label: "Reportes",         section: "bo" },
  { href: "/admin/impresoras",         icon: "🖨️",  label: "Impresoras",       section: "bo" },
  { href: "/admin/integraciones",       icon: "🔌",  label: "Integraciones",    section: "bo" },
];

const SECTIONS = [
  { key: "tpv",   label: "Punto de Venta", color: "var(--gold)" },
  { key: "menu",  label: "Menú",           color: "#3b82f6" },
  { key: "staff", label: "Personal",       color: "#8b5cf6" },
  { key: "bo",    label: "Back Office",    color: "#22c55e" },
];

export default function Sidebar() {
  const path = usePathname();
  const [user, setUser] = useState<any>(null);
  const [imgError, setImgError] = useState(false);
  useEffect(() => { setUser(getUser()); }, []);

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col border-r z-40"
      style={{background:"var(--surf)",borderColor:"var(--border)"}}>

      {/* Logo */}
      <div className="px-5 py-5 border-b" style={{borderColor:"var(--border)"}}>
        <div className="flex items-center gap-3">
          {!imgError ? (
            <Image src="/logo.png" alt="Master Burger's" width={44} height={44}
              className="rounded-xl object-cover"
              onError={() => setImgError(true)}
            />
          ) : (
            <span className="text-2xl">🍔</span>
          )}
          <div>
            <div className="font-syne font-black text-sm leading-tight" style={{color:"var(--text)"}}>Master Burger's</div>
            <div className="text-xs font-bold" style={{color:"var(--gold)"}}>Panel Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 flex flex-col gap-1">
        {SECTIONS.map(section => {
          const items = NAV.filter(i => i.section === section.key);
          return (
            <div key={section.key} className="mb-2">
              <div className="px-4 py-1 text-xs font-black uppercase tracking-wider mb-1"
                style={{color: section.color, opacity: 0.7}}>
                {section.label}
              </div>
              {items.map(item => {
                const active = path === item.href || (item.href !== "/admin" && path.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-3 px-4 py-2 rounded-xl text-sm font-medium transition-all mb-0.5"
                    style={{
                      background: active ? "rgba(245,166,35,0.12)" : "transparent",
                      color: active ? "var(--gold)" : "var(--muted)",
                      border: active ? "1px solid rgba(245,166,35,0.2)" : "1px solid transparent",
                    }}>
                    <span>{item.icon}</span>
                    <span className="font-syne font-bold text-xs">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
            </nav>

      {/* User */}
      <div className="p-3 border-t" style={{borderColor:"var(--border)"}}>
        <div className="px-4 py-3 rounded-xl" style={{background:"var(--surf2)"}}>
          <div className="text-xs font-bold mb-0.5" style={{color:"var(--text)"}}>{user?.name || "Admin"}</div>
          <div className="text-xs mb-2" style={{color:"var(--muted)"}}>{user?.email}</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold" style={{color:"var(--muted)"}}>Tema</span>
            <ThemeToggle size="sm" />
          </div>
          <button onClick={logout}
            className="text-xs font-bold px-3 py-1.5 rounded-lg w-full transition-all"
            style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.15)"}}>
            Cerrar sesion
          </button>
        </div>
      </div>
    </aside>
  );
}
