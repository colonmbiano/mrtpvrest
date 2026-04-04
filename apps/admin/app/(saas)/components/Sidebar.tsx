"use client";
// app/(saas)/components/Sidebar.tsx
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/lib/auth";

const navItems = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1" y="1" width="6" height="6" rx="1.5"/>
        <rect x="9" y="1" width="6" height="6" rx="1.5"/>
        <rect x="1" y="9" width="6" height="6" rx="1.5"/>
        <rect x="9" y="9" width="6" height="6" rx="1.5"/>
      </svg>
    ),
  },
];

const negoItems = [
  {
    href: "/marcas",
    label: "Marcas",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z"/>
      </svg>
    ),
  },
  {
    href: "/ajustes",
    label: "Ajustes",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="2.5"/>
        <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
      </svg>
    ),
  },
  {
    href: "/facturacion",
    label: "Facturación",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="2" y="3" width="12" height="10" rx="1.5"/>
        <path d="M5 7h6M5 10h4"/>
      </svg>
    ),
  },
];

const sysItems = [
  {
    href: "/logs",
    label: "Logs",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M2 4h12M2 8h8M2 12h5"/>
      </svg>
    ),
  },
  {
    href: "/api-keys",
    label: "API Keys",
    icon: (
      <svg className="db-nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <polyline points="5,4 2,8 5,12"/>
        <polyline points="11,4 14,8 11,12"/>
        <line x1="8" y1="3" x2="8" y2="13"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="db-sidebar">
      <div className="db-logo">
        <div className="db-logo-mark">MR<span>TPV</span>REST</div>
        <div className="db-logo-sub">GLOBAL DASHBOARD</div>
      </div>

      <nav className="db-nav">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}
            className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
            {item.icon}
            {item.label}
          </Link>
        ))}

        <div className="db-nav-section">NEGOCIO</div>
        {negoItems.map((item) => (
          <Link key={item.href} href={item.href}
            className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
            {item.icon}
            {item.label}
          </Link>
        ))}

        <div className="db-nav-section">SISTEMA</div>
        {sysItems.map((item) => (
          <Link key={item.href} href={item.href}
            className={`db-nav-item ${pathname === item.href ? "active" : ""}`}>
            {item.icon}
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="db-sidebar-footer">
        <div className="db-user-pill">
          <div className="db-avatar">A</div>
          <div className="db-user-info">
            <p>Alex</p>
            <span>Super Admin</span>
          </div>
        </div>
        <button onClick={logout} className="db-logout-btn">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
            <path d="M11 11l3-3-3-3"/>
            <path d="M14 8H6"/>
          </svg>
          Salir
        </button>
      </div>
    </aside>
  );
}
