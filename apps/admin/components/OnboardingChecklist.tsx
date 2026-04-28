"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

interface ChecklistState {
  hasLogo:       boolean;
  hasMenu:       boolean;
  hasEmployees:  boolean;
  hasLocation:   boolean;
  hasFirstOrder: boolean;
}

const ITEMS = [
  { key: "hasLogo",       label: "Sube tu logo",               href: "/onboarding",           icon: "🎨" },
  { key: "hasMenu",       label: "Configura tu menú",          href: "/admin/menu",            icon: "📋" },
  { key: "hasEmployees",  label: "Crea empleados con PIN",     href: "/admin/empleados",       icon: "👥" },
  { key: "hasLocation",   label: "Configura tu sucursal",      href: "/admin/configuracion",   icon: "📍" },
  { key: "hasFirstOrder", label: "Recibe tu primer pedido",    href: "/admin/pedidos",         icon: "🎉" },
] as const;

export default function OnboardingChecklist() {
  const router = useRouter();
  const [state, setState]       = useState<ChecklistState | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    Promise.all([
      api.get(`/api/tenant/me`).then(r => r.data).catch(() => null),
      api.get(`/api/menu/items`).then(r => r.data).catch(() => []),
      api.get(`/api/employees`).then(r => r.data).catch(() => []),
      api.get(`/api/orders/admin`).then(r => r.data).catch(() => []),
    ]).then(([tenant, menuItems, employees, orders]) => {
      setState({
        hasLogo:       !!(tenant?.logoUrl),
        hasMenu:       Array.isArray(menuItems) && menuItems.length > 0,
        hasEmployees:  Array.isArray(employees) && employees.length > 0,
        hasLocation:   !!(tenant?.restaurants?.[0]),
        hasFirstOrder: Array.isArray(orders) && orders.length > 0,
      });
    }).catch(() => {});
  }, []);

  if (!state) return null;

  const completed = ITEMS.filter(i => state[i.key]).length;
  const total     = ITEMS.length;
  const allDone   = completed === total;

  if (allDone) return null;

  const pct = Math.round((completed / total) * 100);

  return (
    <div className="rounded-2xl border overflow-hidden mb-6"
      style={{ background: "var(--surf)", borderColor: "var(--border)" }}>

      {/* Header */}
      <button onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80 transition-opacity">
        <div className="flex items-center gap-3">
          <span className="text-xl">🚀</span>
          <div className="text-left">
            <p className="text-sm font-black" style={{ color: "var(--text)" }}>
              Configura tu restaurante
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {completed}/{total} tareas completadas
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-orange-500 transition-all duration-500"
              style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-black" style={{ color: "var(--muted)" }}>
            {collapsed ? "▾" : "▴"}
          </span>
        </div>
      </button>

      {/* Items */}
      {!collapsed && (
        <div className="px-5 pb-4 space-y-2">
          {ITEMS.map(item => {
            const done = state[item.key];
            return (
              <button key={item.key}
                onClick={() => !done && router.push(item.href)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all
                  ${done
                    ? "opacity-50 cursor-default"
                    : "hover:bg-white/5 cursor-pointer"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black
                  ${done ? "bg-green-500 text-black" : "bg-white/10 text-gray-500"}`}>
                  {done ? "✓" : "·"}
                </div>
                <span className="text-sm" style={{ color: done ? "var(--muted)" : "var(--text)" }}>
                  <span className="mr-2">{item.icon}</span>
                  {done ? <s>{item.label}</s> : item.label}
                </span>
                {!done && (
                  <span className="ml-auto text-orange-500 text-xs font-bold">→</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
