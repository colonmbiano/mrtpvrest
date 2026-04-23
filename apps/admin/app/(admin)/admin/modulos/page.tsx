"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type ModuleInfo = {
  key: string;
  allowedByPlan: boolean;
  enabled: boolean;
  toggledOn: boolean;
};

type PlanInfo = {
  name: string;
  displayName: string;
  allowedModules: string[];
} | null;

const MODULE_META: Record<string, { label: string; description: string; icon: string }> = {
  KIOSK:    { label: "Kiosko de pedidos",   description: "Pantalla de autoservicio con pago QR vía MercadoPago.", icon: "🖥️" },
  DELIVERY: { label: "Delivery propio",     description: "Gestión de repartidores y pedidos a domicilio.",        icon: "🛵" },
  WEBSTORE: { label: "Tienda online",       description: "Catálogo público y carrito de compras para clientes.",  icon: "🛒" },
  LOYALTY:  { label: "Programa de puntos",  description: "Acumula y canjea puntos de fidelidad.",                 icon: "⭐" },
  KDS:      { label: "Kitchen Display",     description: "Pantalla de cocina en tiempo real.",                    icon: "📺" },
  REPORTS:  { label: "Reportes avanzados",  description: "Análisis de ventas, turnos e inventario.",              icon: "📊" },
};

export default function ModulosPage() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [plan, setPlan] = useState<PlanInfo>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  useEffect(() => {
    loadModules();
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const { data } = await api.get("/api/modules");
      setModules(data.modules ?? []);
      setPlan(data.plan ?? null);
    } catch {
      showToast("Error al cargar los módulos", false);
    } finally {
      setLoading(false);
    }
  }

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function toggleModule(key: string, currentEnabled: boolean) {
    if (toggling) return;
    setToggling(key);
    try {
      await api.patch(`/api/modules/${key}`, { enabled: !currentEnabled });
      await loadModules();
      showToast(`Módulo ${key} ${!currentEnabled ? "activado" : "desactivado"} correctamente`);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? "Error al cambiar el módulo";
      showToast(msg, false);
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Toast */}
      {toast && (
        <div
          className="fixed top-6 right-6 z-50 px-4 py-3 rounded-xl text-sm font-bold shadow-lg"
          style={{
            background: toast.ok ? "var(--brand-primary)" : "#ef4444",
            color: "#fff",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-2xl font-black tracking-tighter mb-1"
          style={{ color: "var(--text)", fontFamily: "Syne, sans-serif" }}
        >
          Módulos opcionales
        </h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Activa o desactiva funcionalidades según tu plan.
        </p>
        {plan && (
          <span
            className="inline-block mt-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest"
            style={{ background: "var(--brand-primary)22", color: "var(--brand-primary)" }}
          >
            Plan {plan.displayName}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 py-16 justify-center" style={{ color: "var(--muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Cargando módulos…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {modules.map((mod) => {
            const meta = MODULE_META[mod.key] ?? { label: mod.key, description: "", icon: "🔧" };
            const isToggling = toggling === mod.key;
            return (
              <div
                key={mod.key}
                className="flex items-center gap-4 p-4 rounded-2xl"
                style={{
                  background: "var(--surf)",
                  border: `1px solid ${mod.enabled ? "var(--brand-primary)33" : "var(--border)"}`,
                }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: "var(--surf2)" }}
                >
                  {meta.icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm" style={{ color: "var(--text)" }}>
                      {meta.label}
                    </span>
                    {!mod.allowedByPlan && (
                      <span
                        className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest"
                        style={{ background: "#f59e0b22", color: "#f59e0b" }}
                      >
                        Upgrade requerido
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                    {meta.description}
                  </p>
                </div>

                {/* Toggle */}
                <button
                  type="button"
                  disabled={!mod.allowedByPlan || isToggling}
                  onClick={() => toggleModule(mod.key, mod.toggledOn)}
                  className="relative flex-shrink-0 w-12 h-6 rounded-full transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: mod.toggledOn
                      ? "var(--brand-primary)"
                      : "var(--surf2)",
                    border: `2px solid ${mod.toggledOn ? "var(--brand-primary)" : "var(--border)"}`,
                  }}
                  title={!mod.allowedByPlan ? "No incluido en tu plan" : undefined}
                >
                  {isToggling ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin opacity-60" />
                    </span>
                  ) : (
                    <span
                      className="absolute top-0.5 w-4 h-4 rounded-full transition-all duration-200"
                      style={{
                        background: mod.toggledOn ? "#fff" : "var(--muted)",
                        left: mod.toggledOn ? "calc(100% - 1.1rem)" : "0.15rem",
                        opacity: mod.toggledOn ? 1 : 0.5,
                      }}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
