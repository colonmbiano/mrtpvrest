"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";
import { NAV_SECTIONS } from "@/lib/nav";

// El sidebar es SOLO desktop (≥768px). En móvil se oculta vía CSS
// (`.db-sidebar { display:none }`) y la navegación la manejan MobileTopBar
// (drawer) + MobileTabBar (barra inferior). Por eso aquí ya no vive el markup
// del drawer móvil (antes duplicado y muerto).

const IconLogOut = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M6 3H3a1 1 0 00-1 1v8a1 1 0 001 1h3" />
    <path d="M10 11l4-3-4-3" />
    <path d="M14 8H6" />
  </svg>
);

export default function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="db-sidebar">
      {/* ── Logo ── */}
      <div className="db-logo">
        <div className="db-logo-mark">
          MRTPV<span>REST</span>
        </div>
        <div className="db-logo-sub">Global Dashboard</div>
        <div style={{
          marginTop: 8,
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "3px 8px",
          borderRadius: 6,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.5px",
          textTransform: "uppercase" as const,
          background: "var(--orange-dim)",
          color: "var(--orange)",
          border: "1px solid var(--orange-glow)",
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--orange)", display: "inline-block" }} />
          SaaS Central
        </div>
      </div>

      {/* ── Navigation (fuente única: lib/nav) ── */}
      <nav className="db-nav">
        {NAV_SECTIONS.map((section, i) => (
          <div key={section.title ?? `sec-${i}`}>
            {section.title && <div className="db-nav-section">{section.title}</div>}
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`db-nav-item ${isActive(item.href) ? "active" : ""}`}
              >
                <item.Icon className="db-nav-icon" />
                {item.label}
              </Link>
            ))}
          </div>
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
        <button onClick={() => logout()} className="db-logout-btn">
          <IconLogOut />
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}
