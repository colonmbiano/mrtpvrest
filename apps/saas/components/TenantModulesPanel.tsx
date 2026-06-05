"use client";
import { useMemo, useState, useTransition } from "react";
import { MessageSquare } from "lucide-react";
import api from "@/lib/api";
// Catálogo único del frontend (lista + detalle + este panel).
import { MODULE_CATALOG, planKeysFor, type ModuleDef, type Accent } from "@/lib/modules";

export interface TenantModulesData {
  id: string;
  hasInventory: boolean;
  hasDelivery: boolean;
  hasWebStore: boolean;
  enabledModules?: string[];
  whatsappNumber: string | null;
}

export interface PlanModulesInfo {
  allowedModules?: string[] | null;
  hasKDS?: boolean | null;
  hasLoyalty?: boolean | null;
  hasReports?: boolean | null;
}

interface Props {
  tenant: TenantModulesData;
  plan?: PlanModulesInfo | null;
  onUpdated?: (patch: Partial<TenantModulesData>) => void;
  onError?: (msg: string) => void;
}

function lowerSet(values?: (string | null | undefined)[] | null): Set<string> {
  return new Set((values ?? []).filter(Boolean).map(v => String(v).toLowerCase()));
}

export default function TenantModulesPanel({ tenant, plan, onUpdated, onError }: Props) {
  // Estado local con enabledModules normalizado: incluimos las claves derivadas
  // de los flags legacy (delivery/webstore) para que un tenant que solo tenga
  // los booleanos seteados muestre el módulo como activo y no se apague al
  // togglear otro.
  const [local, setLocal] = useState<TenantModulesData>(() => {
    const set = lowerSet(tenant.enabledModules);
    if (tenant.hasDelivery) set.add("delivery");
    if (tenant.hasWebStore) set.add("webstore");
    return { ...tenant, enabledModules: [...set] };
  });
  const [whatsappDraft, setWhatsappDraft] = useState(tenant.whatsappNumber ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const planModules = useMemo(() => lowerSet(plan?.allowedModules), [plan]);

  function isOn(def: ModuleDef): boolean {
    if (def.kind === "flag" && def.flag) return Boolean(local[def.flag]);
    const set = lowerSet(local.enabledModules);
    return [def.key, ...(def.aliases ?? [])].some(k => set.has(k.toLowerCase()));
  }

  function includedByPlan(def: ModuleDef): boolean {
    if (planKeysFor(def).some(k => planModules.has(k.toLowerCase()))) return true;
    if (def.planFlag && plan?.[def.planFlag]) return true;
    return false;
  }

  function persist(patch: Partial<TenantModulesData>) {
    startTransition(async () => {
      const prev = local;
      setLocal({ ...local, ...patch });
      try {
        const { data } = await api.patch(`/api/saas/tenants/${tenant.id}/modules`, patch);
        // El backend devuelve el tenant completo y sincroniza flags derivados;
        // re-alineamos el estado local con la respuesta autoritativa.
        const synced: Partial<TenantModulesData> = {
          hasInventory:   typeof data?.hasInventory === "boolean" ? data.hasInventory : undefined,
          hasDelivery:    typeof data?.hasDelivery === "boolean" ? data.hasDelivery : undefined,
          hasWebStore:    typeof data?.hasWebStore === "boolean" ? data.hasWebStore : undefined,
          enabledModules: Array.isArray(data?.enabledModules) ? data.enabledModules : undefined,
          whatsappNumber: data?.whatsappNumber !== undefined ? data.whatsappNumber : undefined,
        };
        const clean = Object.fromEntries(
          Object.entries(synced).filter(([, v]) => v !== undefined),
        ) as Partial<TenantModulesData>;
        setLocal(l => ({ ...l, ...clean }));
        onUpdated?.(clean);
      } catch (err: any) {
        setLocal(prev); // revert
        onError?.(err?.response?.data?.error || "Error al actualizar módulos");
      }
    });
  }

  function toggle(def: ModuleDef) {
    if (isPending) return;
    if (def.kind === "flag" && def.flag) {
      persist({ [def.flag]: !local[def.flag] } as Partial<TenantModulesData>);
      return;
    }
    // Módulo por clave: recalculamos el array enabledModules.
    const set = lowerSet(local.enabledModules);
    const keys = [def.key, ...(def.aliases ?? [])];
    const currentlyOn = keys.some(k => set.has(k.toLowerCase()));
    if (currentlyOn) keys.forEach(k => set.delete(k.toLowerCase()));
    else set.add(def.key.toLowerCase());
    persist({ enabledModules: [...set] });
  }

  function saveWhatsapp() {
    const clean = whatsappDraft.trim() || null;
    if (clean === (local.whatsappNumber ?? null)) {
      setEditingPhone(false);
      return;
    }
    persist({ whatsappNumber: clean });
    setEditingPhone(false);
  }

  const activeCount = MODULE_CATALOG.filter(isOn).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, opacity: isPending ? 0.7 : 1, transition: "opacity .15s" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11.5, color: "var(--text2)" }}>
          {activeCount} de {MODULE_CATALOG.length} módulos activos · el TPV los lee al boot
        </div>
        {plan && (
          <span style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono, monospace" }}>
            La etiqueta <strong style={{ color: "var(--text2)" }}>PLAN</strong> indica módulos incluidos por el plan
          </span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
        {MODULE_CATALOG.map(def => {
          const on = isOn(def);
          const inPlan = includedByPlan(def);
          const Icon = def.Icon;
          return (
            <button
              key={def.key}
              type="button"
              role="switch"
              aria-checked={on}
              aria-label={def.label}
              onClick={() => toggle(def)}
              disabled={isPending}
              style={{
                textAlign: "left", display: "flex", gap: 12, alignItems: "flex-start",
                padding: 14, borderRadius: 12, cursor: isPending ? "default" : "pointer",
                background: on ? `var(--${def.accent}-dim)` : "var(--surface2)",
                border: `1px solid ${on ? `var(--${def.accent})` : "var(--border)"}`,
                transition: "all .15s",
              }}
            >
              <span style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: on ? `var(--${def.accent})` : "var(--surface3)",
                color: on ? "#fff" : "var(--text3)", transition: "all .15s",
              }}>
                <Icon size={18} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{def.label}</span>
                  {inPlan && (
                    <span style={{
                      fontSize: 8.5, fontFamily: "DM Mono, monospace", letterSpacing: "0.08em",
                      padding: "1px 5px", borderRadius: 5, textTransform: "uppercase",
                      background: "var(--surface3)", color: "var(--text2)", border: "1px solid var(--border)",
                    }}>Plan</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.4 }}>{def.description}</div>
              </div>
              <Switch on={on} accent={def.accent} />
            </button>
          );
        })}
      </div>

      {/* Mensajería (WhatsApp) — usada por la tienda web / notificaciones */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        paddingTop: 14, borderTop: "1px solid var(--border)",
      }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text2)" }}>
          <MessageSquare size={13} /> WhatsApp del negocio
        </span>
        {editingPhone ? (
          <>
            <input
              autoFocus
              type="tel"
              value={whatsappDraft}
              onChange={(e) => setWhatsappDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveWhatsapp();
                if (e.key === "Escape") { setWhatsappDraft(local.whatsappNumber ?? ""); setEditingPhone(false); }
              }}
              placeholder="+52 55 1234 5678"
              disabled={isPending}
              style={{
                background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8,
                padding: "5px 10px", fontSize: 12, color: "var(--text)", outline: "none",
                fontFamily: "DM Mono, monospace", width: 170,
              }}
            />
            <button onClick={saveWhatsapp} disabled={isPending} className="db-btn db-btn-orange" style={{ padding: "5px 12px", fontSize: 11 }}>
              Guardar
            </button>
          </>
        ) : (
          <button
            onClick={() => { setWhatsappDraft(local.whatsappNumber ?? ""); setEditingPhone(true); }}
            className="db-btn"
            style={{ padding: "5px 12px", fontSize: 11, fontFamily: "DM Mono, monospace", color: local.whatsappNumber ? "var(--text2)" : "var(--text3)" }}
          >
            {local.whatsappNumber ? `📱 ${local.whatsappNumber}` : "+ Agregar número"}
          </button>
        )}
      </div>
    </div>
  );
}

function Switch({ on, accent }: { on: boolean; accent: Accent }) {
  return (
    <span
      aria-hidden
      style={{
        width: 40, height: 23, borderRadius: 999, padding: 2, flexShrink: 0,
        background: on ? `var(--${accent})` : "var(--surface3)",
        border: `1px solid ${on ? `var(--${accent})` : "var(--border2)"}`,
        display: "inline-flex", alignItems: "center",
        justifyContent: on ? "flex-end" : "flex-start",
        transition: "all .15s",
      }}
    >
      <span style={{ width: 17, height: 17, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.45)" }} />
    </span>
  );
}
