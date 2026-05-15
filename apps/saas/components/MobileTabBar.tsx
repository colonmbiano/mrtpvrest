"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

export default function MobileTabBar() {
  const pathname = usePathname();

  const tabs = [
    { href: "/dashboard", label: "Inicio", icon: <IconHome /> },
    { href: "/logs", label: "Alertas", icon: <IconBell />, badge: 3 },
    { href: "/errors", label: "Errores", icon: <IconError />, badge: 12 },
  ];

  return (
    <nav className="mobile-tabbar md:hidden">
      {tabs.map((tab) => {
        const isActive = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={`tab-item ${isActive ? "active" : ""}`}>
            <div className="tab-icon-wrap">
              {tab.icon}
              {tab.badge && <span className="tab-badge">{tab.badge}</span>}
            </div>
            <span className="tab-label">{tab.label}</span>
          </Link>
        );
      })}

      <style jsx>{`
        .mobile-tabbar {
          height: 82px;
          background: rgba(12, 12, 23, 0.9);
          backdrop-filter: blur(16px);
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
          gap: 6px;
          text-decoration: none;
          color: var(--text3);
          transition: all 0.2s;
          flex: 1;
        }
        .tab-item.active {
          color: var(--orange);
        }
        .tab-icon-wrap {
          position: relative;
          padding: 6px 16px;
          border-radius: 20px;
          transition: background 0.2s;
        }
        .tab-item.active .tab-icon-wrap {
          background: var(--orange-dim);
        }
        .tab-label {
          font-size: 11px;
          font-weight: 500;
        }
        .tab-item.active .tab-label {
          font-weight: 600;
        }
        .tab-badge {
          position: absolute;
          top: 0;
          right: 6px;
          background: var(--red);
          color: #fff;
          font-size: 9px;
          font-weight: 700;
          min-width: 16px;
          height: 16px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          border: 2px solid #0c0c17;
        }
      `}</style>
    </nav>
  );
}
