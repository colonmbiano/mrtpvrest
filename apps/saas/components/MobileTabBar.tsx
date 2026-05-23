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

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconError = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const POLL_MS = 15_000;

export default function MobileTabBar() {
  const pathname = usePathname();
  const [errorsCount, setErrorsCount] = useState<number | null>(null);
  const [alertsCount, setAlertsCount] = useState<number | null>(null);

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
        if (errRes.status === "fulfilled") setErrorsCount(errRes.value.data.total ?? 0);
        if (logsRes.status === "fulfilled") setAlertsCount(logsRes.value.data.total ?? 0);
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

  const tabs = [
    { href: "/dashboard", label: "Inicio",  icon: <IconHome />,  badge: null as number | null },
    { href: "/logs",      label: "Alertas", icon: <IconBell />,  badge: alertsCount },
    { href: "/errors",    label: "Errores", icon: <IconError />, badge: errorsCount },
  ];

  return (
    <nav className="mobile-tabbar md:hidden">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        const showBadge = typeof tab.badge === "number" && tab.badge > 0;
        return (
          <Link key={tab.href} href={tab.href} className={`tab-item ${isActive ? "active" : ""}`}>
            <div className="tab-icon-wrap">
              {tab.icon}
              {showBadge && (
                <span className="tab-badge">
                  {tab.badge! > 99 ? "99+" : tab.badge}
                </span>
              )}
            </div>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}

      <style jsx>{`
        .mobile-tabbar {
          height: 70px;
          background: rgba(8, 8, 16, 0.92);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-top: 1px solid var(--border);
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          justify-content: space-around;
          padding-bottom: env(safe-area-inset-bottom);
          z-index: 50;
        }
        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          text-decoration: none;
          color: var(--text3);
          transition: color 0.18s;
          flex: 1;
          padding: 6px 0;
        }
        .tab-item.active {
          color: var(--orange);
        }
        .tab-icon-wrap {
          position: relative;
          padding: 5px 18px;
          border-radius: 18px;
          transition: background 0.18s;
        }
        .tab-item.active .tab-icon-wrap {
          background: var(--orange-dim);
        }
        .tab-label {
          font-size: 10.5px;
          font-weight: 500;
          letter-spacing: 0.1px;
        }
        .tab-item.active .tab-label {
          font-weight: 700;
        }
        .tab-badge {
          position: absolute;
          top: -2px;
          right: 4px;
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
