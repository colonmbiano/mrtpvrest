"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import api from "@/lib/api";

const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);
const IconBrands = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M12 2l2.6 6.1 6.6.5-5 4.3 1.5 6.4L12 16.4 6.3 19.8l1.5-6.4-5-4.3 6.6-.5z" />
  </svg>
);
const IconReceipt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M5 3h14a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2-3-2V4a1 1 0 0 1 1-1z" />
    <line x1="8" y1="8" x2="16" y2="8" />
    <line x1="8" y1="12" x2="13" y2="12" />
  </svg>
);
const IconMenu = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <line x1="3" y1="6" x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

const POLL_MS = 15_000;

export default function MobileTabBar() {
  const pathname = usePathname();
  const [issues, setIssues] = useState<number>(0);

  // Conteo combinado de errores + alertas → señal "hay algo que revisar" que
  // se muestra como badge en el item "Menú" (de ahí se accede a Logs/Errores).
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const fetchCounts = async () => {
      try {
        const [errRes, logsRes] = await Promise.allSettled([
          api.get<{ total: number }>("/api/admin/logs/db", { params: { limit: 1, minLevel: "ERROR" } }),
          api.get<{ total: number }>("/api/admin/logs/db", { params: { limit: 1, level: "WARN" } }),
        ]);
        if (cancelled) return;
        const err = errRes.status === "fulfilled" ? (errRes.value.data.total ?? 0) : 0;
        const warn = logsRes.status === "fulfilled" ? (logsRes.value.data.total ?? 0) : 0;
        setIssues(err + warn);
      } catch { /* silent */ }
      finally {
        if (!cancelled) timer = setTimeout(fetchCounts, POLL_MS);
      }
    };

    fetchCounts();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const links = [
    { href: "/dashboard",   label: "Inicio",      icon: <IconHome />,    exact: true },
    { href: "/marcas",      label: "Marcas",      icon: <IconBrands />,  exact: false },
    { href: "/facturacion", label: "Facturación", icon: <IconReceipt />, exact: false },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="mobile-tabbar md:hidden">
      {links.map((tab) => {
        const active = isActive(tab.href, tab.exact);
        return (
          <Link key={tab.href} href={tab.href} className={`tab-item ${active ? "active" : ""}`}>
            <div className="tab-icon-wrap">{tab.icon}</div>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}

      {/* "Menú" abre el drawer completo (gestionado por MobileTopBar) */}
      <button
        type="button"
        className="tab-item tab-item-btn"
        aria-label="Abrir menú"
        onClick={() => window.dispatchEvent(new Event("saas:open-nav"))}
      >
        <div className="tab-icon-wrap">
          <IconMenu />
          {issues > 0 && <span className="tab-badge">{issues > 99 ? "99+" : issues}</span>}
        </div>
        <span className="tab-label">Menú</span>
      </button>

      <style jsx>{`
        .mobile-tabbar {
          height: 64px;
          background: rgba(8, 8, 16, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--border);
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: stretch;
          justify-content: space-around;
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 50;
        }
        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 3px;
          text-decoration: none;
          color: var(--text3);
          transition: color 0.18s;
          flex: 1;
          padding: 6px 0;
          background: none;
          border: none;
          font-family: inherit;
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }
        .tab-item.active { color: var(--orange); }
        .tab-icon-wrap {
          position: relative;
          padding: 4px 16px;
          border-radius: 16px;
          transition: background 0.18s;
        }
        .tab-item.active .tab-icon-wrap { background: var(--orange-dim); }
        .tab-label {
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.1px;
        }
        .tab-item.active .tab-label { font-weight: 700; }
        .tab-badge {
          position: absolute;
          top: -2px;
          right: 6px;
          background: var(--red);
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          min-width: 17px;
          height: 17px;
          border-radius: 9px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          border: 2px solid #0c0c17;
          line-height: 1;
        }
      `}</style>
    </nav>
  );
}
