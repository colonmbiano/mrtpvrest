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
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <rect x="1" y="1" width="6" height="6" rx="1"/>
    <rect x="9" y="1" width="6" height="6" rx="1"/>
    <rect x="1" y="9" width="6" height="6" rx="1"/>
    <rect x="9" y="9" width="6" height="6" rx="1"/>
  </svg>
);
const IconStar = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M8 1.5l1.8 4.2 4.5.4-3.3 3 1 4.4L8 11.2l-4 2.3 1-4.4-3.3-3 4.5-.4z"/>
  </svg>
);
const IconSettings = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
  </svg>
);
const IconReceipt = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M3 2.5h10a.5.5 0 01.5.5v11l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3a.5.5 0 01.5-.5z"/>
    <line x1="5" y1="6.5" x2="11" y2="6.5"/>
    <line x1="5" y1="9.5" x2="8" y2="9.5"/>
  </svg>
);
const IconTerminal = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M2 4h12a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z"/>
    <path d="M4 8l2-2-2-2M8 10h3"/>
  </svg>
);
const IconAlertTri = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
    <path d="M8 1.5L1.5 13.5h13z"/>
    <line x1="8" y1="6" x2="8" y2="9.5"/>
    <circle cx="8" cy="11.5" r="0.6" fill="currentColor"/>
  </svg>
);
const IconKey = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
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
  { href: "/tpv-config",  label: "TPV Config",  icon: <IconTerminal /> },
  { href: "/tpv-updates", label: "TPV Updates", icon: <IconTerminal /> },
  { href: "/logs",        label: "Logs / Alertas", icon: <IconTerminal /> },
  { href: "/errors",      label: "Errores",     icon: <IconAlertTri /> },
  { href: "/api-keys",    label: "API Keys",    icon: <IconKey /> },
];

export default function MobileTopBar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      <header className="mobile-topbar md:hidden">
        <button
          type="button"
          aria-label="Abrir menú"
          className="mobile-menu-btn"
          onClick={() => setOpen(true)}
        >
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
        <div
          className="mobile-drawer-overlay md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`mobile-drawer md:hidden ${open ? "is-open" : ""}`} role="dialog" aria-label="Menú principal">
        <div className="mobile-drawer-head">
          <div className="mobile-drawer-logo">
            MRTPV<span>REST</span>
            <span className="mobile-drawer-tag">SaaS</span>
          </div>
          <button
            type="button"
            aria-label="Cerrar menú"
            className="mobile-menu-btn"
            onClick={() => setOpen(false)}
          >
            <IconClose />
          </button>
        </div>

        <nav className="mobile-drawer-nav">
          {mainItems.map((it) => (
            <Link key={it.href} href={it.href} className={`mobile-drawer-item ${pathname === it.href ? "active" : ""}`}>
              <span className="mobile-drawer-icon">{it.icon}</span>
              {it.label}
            </Link>
          ))}

          <div className="mobile-drawer-section">Negocio</div>
          {negoItems.map((it) => (
            <Link key={it.href} href={it.href} className={`mobile-drawer-item ${pathname === it.href ? "active" : ""}`}>
              <span className="mobile-drawer-icon">{it.icon}</span>
              {it.label}
            </Link>
          ))}

          <div className="mobile-drawer-section">Sistema</div>
          {sysItems.map((it) => (
            <Link key={it.href} href={it.href} className={`mobile-drawer-item ${pathname === it.href ? "active" : ""}`}>
              <span className="mobile-drawer-icon">{it.icon}</span>
              {it.label}
            </Link>
          ))}
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

      <style jsx>{`
        .mobile-topbar {
          height: 56px;
          padding: 0 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          background: var(--bg);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 50;
        }
        .mobile-menu-btn, .mobile-ia-btn {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: var(--surface2);
          border: 1px solid var(--border);
          color: var(--text2);
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          cursor: pointer;
          flex-shrink: 0;
          transition: background 0.15s, color 0.15s;
        }
        .mobile-menu-btn:active, .mobile-ia-btn:active {
          background: var(--surface3);
          color: var(--text);
        }
        .mobile-logo {
          font-family: 'Syne', 'DM Sans', sans-serif;
          font-weight: 800;
          font-size: 15px;
          letter-spacing: -0.3px;
          color: var(--text);
          text-decoration: none;
          flex: 1;
          text-align: center;
        }
        .mobile-logo span { color: var(--orange); }
        .ia-dot-pulsing {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 7px;
          height: 7px;
          background: var(--orange);
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7);
          animation: pulse-iris 2s infinite;
        }
        @keyframes pulse-iris {
          0%   { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.7); }
          70%  { transform: scale(1);    box-shadow: 0 0 0 8px rgba(124, 58, 237, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(124, 58, 237, 0); }
        }

        .mobile-drawer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          backdrop-filter: blur(4px);
          z-index: 90;
          animation: fadeIn 0.2s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .mobile-drawer {
          position: fixed;
          top: 0;
          left: 0;
          bottom: 0;
          width: min(82vw, 320px);
          background: var(--surface);
          border-right: 1px solid var(--border);
          z-index: 100;
          display: flex;
          flex-direction: column;
          transform: translateX(-100%);
          transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
          box-shadow: 4px 0 24px rgba(0, 0, 0, 0.5);
        }
        .mobile-drawer.is-open {
          transform: translateX(0);
        }
        .mobile-drawer-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
        }
        .mobile-drawer-logo {
          font-family: 'Syne', 'DM Sans', sans-serif;
          font-weight: 800;
          font-size: 16px;
          letter-spacing: -0.3px;
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mobile-drawer-logo span:first-of-type { color: var(--orange); }
        .mobile-drawer-tag {
          font-size: 9px !important;
          font-weight: 700 !important;
          color: var(--orange) !important;
          background: var(--orange-dim);
          border: 1px solid var(--orange-glow);
          padding: 2px 7px;
          border-radius: 6px;
          letter-spacing: 0.8px;
          text-transform: uppercase;
        }
        .mobile-drawer-nav {
          flex: 1;
          overflow-y: auto;
          padding: 10px 10px 14px;
        }
        .mobile-drawer-nav::-webkit-scrollbar { display: none; }
        .mobile-drawer-section {
          font-size: 9.5px;
          font-weight: 700;
          color: var(--text3);
          letter-spacing: 2px;
          padding: 14px 12px 6px;
          text-transform: uppercase;
        }
        .mobile-drawer-item {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 11px 12px;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 500;
          color: var(--text2);
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
          margin-bottom: 2px;
          border: 1px solid transparent;
          text-decoration: none;
          line-height: 1;
        }
        .mobile-drawer-item:active {
          background: var(--surface2);
          color: var(--text);
        }
        .mobile-drawer-item.active {
          background: var(--orange-dim);
          color: var(--orange);
          border-color: var(--orange-glow);
        }
        .mobile-drawer-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        }
        .mobile-drawer-item.active .mobile-drawer-icon { opacity: 1; }

        .mobile-drawer-footer {
          padding: 12px;
          border-top: 1px solid var(--border);
          flex-shrink: 0;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
        .mobile-drawer-user {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 11px;
          border-radius: 10px;
          background: var(--surface2);
          border: 1px solid var(--border);
        }
        .mobile-drawer-avatar {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: var(--orange-dim);
          border: 1px solid var(--orange-glow);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 700;
          color: var(--orange);
          flex-shrink: 0;
        }
        .mobile-drawer-user-info { flex: 1; min-width: 0; }
        .mobile-drawer-user-info p {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--text);
          margin: 0;
          line-height: 1.2;
        }
        .mobile-drawer-user-info span {
          font-size: 10.5px;
          color: var(--text3);
          display: block;
          margin-top: 2px;
          line-height: 1;
        }
        .mobile-drawer-logout {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          margin-top: 8px;
          padding: 10px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          font-family: inherit;
          background: var(--red-dim);
          color: var(--red);
          border: 1px solid rgba(239, 68, 68, 0.18);
        }
        .mobile-drawer-logout:active { background: rgba(239, 68, 68, 0.22); }
      `}</style>
    </>
  );
}
