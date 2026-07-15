"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PRIMARY_TABS } from "@/lib/nav";

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

  const isActive = (href: string) =>
    pathname === href || pathname === href + "/" || pathname.startsWith(href + "/");

  return (
    <nav className="mobile-tabbar md:hidden">
      {PRIMARY_TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <Link key={tab.href} href={tab.href} className={`tab-item ${active ? "active" : ""}`}>
            <div className="tab-icon-wrap"><tab.Icon width={22} height={22} /></div>
            <span className="tab-label">{tab.short ?? tab.label}</span>
          </Link>
        );
      })}

      {/* "Menú" abre el drawer completo (gestionado por MobileTopBar) */}
      <button
        type="button"
        className="tab-item"
        aria-label="Abrir menú"
        onClick={() => window.dispatchEvent(new Event("saas:open-nav"))}
      >
        <div className="tab-icon-wrap">
          <IconMenu />
          {issues > 0 && <span className="tab-badge">{issues > 99 ? "99+" : issues}</span>}
        </div>
        <span className="tab-label">Menú</span>
      </button>
    </nav>
  );
}
