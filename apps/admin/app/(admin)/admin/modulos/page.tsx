"use client";

import { useEffect, useState } from "react";
import {
  Monitor, Bike, ShoppingCart, Star, Tv, BarChart3, Wrench,
  CheckCircle2, XCircle, Receipt, type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, SettingRow, Toggle, Pill,
} from "@/components/warmtech";

type ModuleInfo = {
  key: string;
  allowedByPlan: boolean;
  enabled: boolean;
  toggledOn: boolean;
  managedByPlan?: boolean;
};

type PlanInfo = {
  name: string;
  displayName: string;
  allowedModules: string[];
} | null;

const MODULE_META: Record<string, { label: string; description: string; icon: LucideIcon }> = {
  KIOSK:    { label: "Kiosko de pedidos",   description: "Pantalla de autoservicio con pago QR.",                 icon: Monitor },
  DELIVERY: { label: "Delivery propio",     description: "Gestión de repartidores y pedidos a domicilio.",        icon: Bike },
  WEBSTORE: { label: "Tienda online",       description: "Catálogo público y carrito de compras para clientes.",  icon: ShoppingCart },
  LOYALTY:  { label: "Programa de puntos",  description: "Acumula y canjea puntos de fidelidad.",                 icon: Star },
  KDS:      { label: "Kitchen Display",     description: "Pantalla de cocina en tiempo real.",                    icon: Tv },
  REPORTS:  { label: "Reportes avanzados",  description: "Análisis de ventas, turnos e inventario.",              icon: BarChart3 },
  PAYROLL:  { label: "Nómina y caja de empleado", description: "La raya (pago por día) + consumo a cuenta de empleado con su descuento.", icon: Receipt },
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
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error al cambiar el módulo";
      showToast(msg, false);
    } finally {
      setToggling(null);
    }
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Funcionalidades"
        title="Módulos opcionales"
        subtitle="Activa o desactiva funcionalidades según tu plan."
        actions={plan ? <Pill tone="ac">Plan {plan.displayName}</Pill> : undefined}
      />

      {/* mobile plan badge */}
      {plan && (
        <div className="mb-3 md:hidden">
          <Pill tone="ac">Plan {plan.displayName}</Pill>
        </div>
      )}

      <SectionLabel>Disponibles en tu cuenta</SectionLabel>

      {loading ? (
        <WtCard className="flex items-center justify-center gap-3 py-16 text-sm text-tx-mut">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Cargando módulos…
        </WtCard>
      ) : (
        <WtCard className="overflow-hidden">
          {modules.map((mod, idx) => {
            const meta = MODULE_META[mod.key] ?? { label: mod.key, description: "", icon: Wrench };
            const isToggling = toggling === mod.key;
            const isActive = mod.enabled || mod.toggledOn;
            const isPlanManaged = Boolean(mod.managedByPlan);
            const locked = !mod.allowedByPlan || isPlanManaged || isToggling;

            return (
              <SettingRow
                key={mod.key}
                icon={meta.icon}
                hot={isActive}
                label={meta.label}
                sub={meta.description}
                badge={!mod.allowedByPlan ? "UPGRADE" : isPlanManaged ? "PLAN" : undefined}
                last={idx === modules.length - 1}
                right={
                  isToggling ? (
                    <span className="grid h-[25px] w-[42px] place-items-center">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent text-tx-mut" />
                    </span>
                  ) : (
                    <span className={locked ? "pointer-events-none opacity-40" : ""}>
                      <Toggle
                        checked={isActive}
                        onChange={() => toggleModule(mod.key, isActive)}
                        label={`Activar ${meta.label}`}
                      />
                    </span>
                  )
                }
              />
            );
          })}
        </WtCard>
      )}

      {toast && (
        <div
          className="fixed bottom-24 right-5 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-[13px] font-bold md:bottom-7 md:right-7"
          style={{
            background: toast.ok ? "var(--ok-soft)" : "var(--err-soft)",
            border: `1px solid ${toast.ok ? "var(--ok)" : "var(--err)"}`,
            color: toast.ok ? "var(--ok)" : "var(--err)",
            boxShadow: "0 4px 24px rgba(0,0,0,.4)",
          }}
        >
          {toast.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </WtScreen>
  );
}
