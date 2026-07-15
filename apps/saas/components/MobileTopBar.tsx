"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";
import { NAV_SECTIONS } from "@/lib/nav";

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

  return (
    <>
      <header className="mobile-topbar md:hidden">
        <button type="button" aria-label="Abrir menú" className="mobile-menu-btn" onClick={() => setOpen(true)}>
          <IconMenu />
        </button>
        <Link href="/dashboard" className="mobile-logo">
          MRTPV<span>REST</span>
        </Link>
        {/* Abre el asistente IA (SaaSAgent escucha este evento). */}
        <button
          type="button"
          aria-label="Asistente IA"
          className="mobile-ia-btn"
          onClick={() => window.dispatchEvent(new Event("saas:open-agent"))}
        >
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
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.title ?? `sec-${i}`}>
              {section.title && <div className="mobile-drawer-section">{section.title}</div>}
              {section.items.map((item) => (
                <Link key={item.href} href={item.href} className={`mobile-drawer-item ${isActive(item.href) ? "active" : ""}`}>
                  <span className="mobile-drawer-icon"><item.Icon width={18} height={18} /></span>
                  {item.label}
                </Link>
              ))}
            </div>
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
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3" />
              <path d="M10 11l4-3-4-3" />
              <path d="M14 8H6" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
