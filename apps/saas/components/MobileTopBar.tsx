"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";

const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
const IconAI = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
    <path d="M12 12L2.7 7.3" />
    <path d="M12 12l9.3 4.7" />
  </svg>
);
const IconGrid = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <rect x="1" y="1" width="6" height="6" rx="1"/>
    <rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
);
const IconStar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M8 1.5l1.8 4.2 4.5.4-3.3 3 1 4.4L8 11.2l-4 2.3 1-4.4-3.3-3 4.5-.4z"/>
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
  </svg>
);
const IconReceipt = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M3 2.5h10a.5.5 0 01.5.5v11l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3a.5.5 0 01.5-.5z"/>
    <line x1="5" y1="6.5" x2="11" y2="6.5"/>
    <line x1="5" y1="9.5" x2="8" y2="9.5"/>
  </svg>
);
const IconTerminal = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M2 4h12a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z"/>
    <path d="M4 8l2-2-2-2M8 10h3"/>
  </svg>
);
const IconAlertTri = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <path d="M8 1.5L1.5 13.5h13z"/>
    <line x1="8" y1="6" x2="8" y2="9.5"/>
    <circle cx="8" cy="11.5" r="0.6" fill="currentColor"/>
  </svg>
);
const IconKey = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
    <circle cx="6.5" cy="6.5" r="3.5"/>
    <path d="M9.5 9.5L14 14M12 12.5v2M10.5 14h2"/>
  </svg>
);
const IconLogOut = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3"/>
    <path d="M10 11l4-3-4-3"/>
    <path d="M14 8H6"/>
  </svg>
);

type NavLink = { href: string; label: string; icon: ReactNode };

const mainItems: NavLink[] = [
  { href: "/dashboard", label: "Vista general", icon: <IconGrid /> },
];
const negoItems: NavLink[] = [
  { href: "/marcas",      label: "Marcas",      icon: <IconStar /> },
  { href: "/planes",      label: "Planes",      icon: <IconSettings /> },
  { href: "/facturacion", label: "Facturación", icon: <IconReceipt /> },
];
const sysItems: NavLink[] = [
  { href: "/tpv-config",  label: "TPV Config",     icon: <IconTerminal /> },
  { href: "/tpv-updates", label: "TPV Updates",    icon: <IconTerminal /> },
  { href: "/logs",        label: "Logs / Alertas", icon: <IconTerminal /> },
  { href: "/errors",      label: "Errores",        icon: <IconAlertTri /> },
  { href: "/api-keys",    label: "API Keys",       icon: <IconKey /> },
];

export default function MobileTopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // El botón "Menú" del tab bar inferior abre este mismo drawer.
  useEffect(() => {
    const openNav = () => setOpen(true);
    window.addEventListener("saas:open-nav", openNav);
    return () => window.removeEventListener("saas:open-nav", openNav);
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  const renderItem = (it: NavLink) => (
    <Link key={it.href} href={it.href} className={`mobile-drawer-item ${isActive(it.href) ? "active" : ""}`}>
      <span className="mobile-drawer-icon">{it.icon}</span>
      {it.label}
    </Link>
  );

  return (
    <>
      <header className="mobile-topbar md:hidden">
        <button type="button" aria-label="Abrir menú" className="mobile-menu-btn" onClick={() => setOpen(true)}>
          <IconMenu />
        </button>
        <Link href="/dashboard" className="mobile-logo">
          MRTPV<span>REST</span>
        </Link>
        <button type="button" aria-label="Asistente IA" className="mobile-ia-btn">
          <IconAI />
          <span className="ia-dot-pulsing" />
        </button>
      </header>

      {open && (
        <div className="mobile-drawer-overlay md:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside className={`mobile-drawer md:hidden ${open ? "is-open" : ""}`} role="dialog" aria-label="Menú principal">
        <div className="mobile-drawer-head">
          <div className="mobile-drawer-logo">
            MRTPV<span>REST</span>
            <span className="mobile-drawer-tag">SaaS</span>
          </div>
          <button type="button" aria-label="Cerrar menú" className="mobile-menu-btn" onClick={() => setOpen(false)}>
            <IconClose />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {mainItems.map(renderItem)}

          <div className="mobile-drawer-section">Negocio</div>
          {negoItems.map(renderItem)}

          <div className="mobile-drawer-section">Sistema</div>
          {sysItems.map(renderItem)}
        </nav>

        <div className="mobile-drawer-footer">
          <div className="mobile-drawer-user">
            <div className="mobile-drawer-avatar">SA</div>
            <div className="mobile-drawer-user-info">
              <p>Super Admin</p>
              <span>Acceso global</span>
            </div>
          </div>
          <button onClick={() => { logout(); setOpen(false); }} className="mobile-drawer-logout">
            <IconLogOut />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
