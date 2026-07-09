"use client";

import { useEffect, useState } from "react";
import {
  Monitor, Bike, ShoppingCart, Star, Tv, BarChart3, Wrench,
  Receipt, Wallet, Utensils, Coins, Users,
  type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, Card, SectionLabel, SettingRow, Toggle, Pill,
  LoadingState, useToast,
} from "@/components/ds";

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
  WAITERS:  { label: "Meseros / Salón",     description: "Toma de órdenes en mesa por meseros.",                  icon: Utensils },
  CASH_SHIFT: { label: "Turnos de caja",    description: "Apertura y corte de turno de caja.",                    icon: Coins },
  EMPLOYEE_MANAGEMENT: { label: "Empleados", description: "Gestión de empleados, roles y PINs.",                  icon: Users },
  FINANCE:  { label: "Finanzas",            description: "Gastos, compras y cortes de caja.",                     icon: Wallet },
};

export default function ModulosPage() {
  const [modules, setModules] = useState<ModuleInfo[]>([]);
  const [plan, setPlan] = useState<PlanInfo>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    loadModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadModules() {
    try {
      setLoading(true);
      const { data } = await api.get("/api/modules");
      setModules(data.modules ?? []);
      setPlan(data.plan ?? null);
    } catch {
      toast.error("Error al cargar los módulos");
    } finally {
      setLoading(false);
    }
  }

  async function toggleModule(key: string, currentEnabled: boolean) {
    if (toggling) return;
    setToggling(key);
    try {
      await api.patch(`/api/modules/${key}`, { enabled: !currentEnabled });
      await loadModules();
      toast.success(`Módulo ${key} ${!currentEnabled ? "activado" : "desactivado"} correctamente`);
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Error al cambiar el módulo";
      toast.error(msg);
    } finally {
      setToggling(null);
    }
  }

  return (
    <PageShell>
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
        <LoadingState label="Cargando módulos…" />
      ) : (
        <Card className="overflow-hidden">
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
        </Card>
      )}
    </PageShell>
  );
}
