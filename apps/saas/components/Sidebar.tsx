"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";

// ── SVG Icon components ──────────────────────────────────────
const IconGrid = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="1" width="6" height="6" rx="1"/>
    <rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
);
const IconStar = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 1.5l1.8 4.2 4.5.4-3.3 3 1 4.4L8 11.2l-4 2.3 1-4.4-3.3-3 4.5-.4z"/>
  </svg>
);
const IconSettings = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
  </svg>
);
const IconReceipt = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 2.5h10a.5.5 0 01.5.5v11l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3a.5.5 0 01.5-.5z"/>
    <line x1="5" y1="6.5" x2="11" y2="6.5"/>
    <line x1="5" y1="9.5" x2="8" y2="9.5"/>
  </svg>
);
const IconTerminal = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4h12a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z"/>
    <path d="M4 8l2-2-2-2M8 10h3"/>
  </svg>
);
const IconKey = () => (
  <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="6.5" cy="6.5" r="3.5"/>
    <path d="M9.5 9.5L14 14M12 12.5v2M10.5 14h2"/>
  </svg>
);
const IconLogOut = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3"/>
    <path d="M10 11l4-3-4-3"/>
    <path d="M14 8H6"/>
  </svg>
);

// ── Nav structure ─────────────────────────────────────────────
const navItems = [
  { href: "/dashboard", label: "Overview",    icon: <IconGrid /> },
];
const negoItems = [
  { href: "/marcas",    label: "Marcas",      icon: <IconStar /> },
  { href: "/ajustes",   label: "Ajustes",     icon: <IconSettings /> },
  { href: "/facturacion", label: "Facturación", icon: <IconReceipt /> },
];
const sysItems = [
  { href: "/logs",      label: "Logs",        icon: <IconTerminal /> },
  { href: "/api-keys",  label: "API Keys",    icon: <IconKey /> },
];

import { useState } from "react";

// ... (iconos se mantienen igual)

export default function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* ── Mobile Header ── */}
      <div className="md:hidden flex items-center justify-between p-4 bg-[var(--surf)] border-b border-[var(--border)] sticky top-0 z-50">
        <div className="db-logo-mark !m-0 !text-xl">
          MRTPV<span>REST</span>
        </div>
        <button onClick={toggleMenu} className="p-2 text-[var(--text)]">
          {isOpen ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
          )}
        </button>
      </div>

      {/* ── Overlay ── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={closeMenu}
        />
      )}

      <aside className={`db-sidebar ${isOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 transition-transform duration-300 fixed md:sticky top-0 left-0 h-screen z-50`}>
        {/* ── Logo ── */}
        <div className="db-logo hidden md:block">
          <div className="db-logo-mark">
            MRTPV<span>REST</span>
          </div>
          <div className="db-logo-sub">Global Dashboard</div>
          <div style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '3px 8px',
            borderRadius: 6,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase' as const,
            background: 'var(--orange-dim)',
            color: 'var(--orange)',
            border: '1px solid var(--orange-glow)',
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--orange)', display: 'inline-block' }} />
            SaaS Central
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="db-nav">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu}
              className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
              {item.icon}
              {item.label}
            </Link>
          ))}

          <div className="db-nav-section">Negocio</div>
          {negoItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu}
              className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
              {item.icon}
              {item.label}
            </Link>
          ))}

          <div className="db-nav-section">Sistema</div>
          {sysItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={closeMenu}
              className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>

        {/* ── Footer ── */}
        <div className="db-sidebar-footer">
          <div className="db-user-pill">
            <div className="db-avatar">SA</div>
            <div className="db-user-info">
              <p>Super Admin</p>
              <span>Acceso global</span>
            </div>
          </div>
          <button onClick={() => { logout(); closeMenu(); }} className="db-logout-btn">
            <IconLogOut />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
