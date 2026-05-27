"use client";
import { useState, useTransition } from "react";
import api from "@/lib/api";

export interface TenantModulesData {
  id: string;
  enabledModules: string[];
  hasInventory?: boolean;
  hasDelivery?: boolean;
  hasWebStore?: boolean;
  whatsappNumber: string | null;
}

export interface PlanInfo {
  displayName?: string;
  allowedModules: string[];
}

interface Props {
  tenant: TenantModulesData;
  plan: PlanInfo | null;
  onUpdated?: (patch: Partial<TenantModulesData>) => void;
  onError?: (msg: string) => void;
}

// Catálogo canónico de módulos opcionales — debe coincidir con
// VALID_MODULES en `apps/backend/src/routes/modules.routes.js`.
const UI_MODULES: { key: string; label: string; description: string; icon: string }[] = [
  { key: "KIOSK",    label: "Kiosko",            description: "Autoservicio con pago QR.",                icon: "🖥️" },
  { key: "DELIVERY", label: "Delivery propio",   description: "Repartidores y pedidos a domicilio.",     icon: "🛵" },
  { key: "WEBSTORE", label: "Tienda online",     description: "Catálogo público con carrito.",            icon: "🛒" },
  { key: "LOYALTY",  label: "Programa de puntos", description: "Acumulación y canje de puntos.",          icon: "⭐" },
  { key: "KDS",      label: "Kitchen Display",    description: "Pantalla de cocina en tiempo real.",      icon: "📺" },
  { key: "REPORTS",  label: "Reportes avanzados", description: "Ventas, turnos e inventario.",            icon: "📊" },
  { key: "FINANCE",  label: "Centro Financiero",  description: "Costeo, margen y P&L.",                   icon: "💰" },
];

// Aliases legacy — `seed-tiers.js` sembró `plan.allowedModules` con strings
// lowercase como 'kiosk', 'client_menu' (WEBSTORE) o 'loyalty_advanced'
// (LOYALTY). Para no migrar la data se acepta ambas convenciones al leer.
const MODULE_ALIASES: Record<string, string[]> = {
  KIOSK:    ["KIOSK", "kiosk"],
  DELIVERY: ["DELIVERY", "delivery"],
  WEBSTORE: ["WEBSTORE", "webstore", "client_menu"],
  LOYALTY:  ["LOYALTY", "loyalty", "loyalty_advanced"],
  KDS:      ["KDS", "kds"],
  REPORTS:  ["REPORTS", "reports"],
  FINANCE:  ["FINANCE", "finance"],
};

function matchAny(key: string, list: string[]) {
  return (MODULE_ALIASES[key] ?? [key]).some(a => list.includes(a));
}

export default function TenantModulesToggle({ tenant, plan, onUpdated, onError }: Props) {
  const [local, setLocal] = useState<TenantModulesData>(tenant);
  const [whatsappDraft, setWhatsappDraft] = useState(tenant.whatsappNumber ?? "");
  const [editingPhone, setEditingPhone] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function persist(patch: Partial<TenantModulesData>) {
    startTransition(async () => {
      const prev = local;
      const next = { ...local, ...patch };
      setLocal(next);
      try {
        await api.patch(`/api/saas/tenants/${tenant.id}/modules`, patch);
        onUpdated?.(patch);
      } catch (err: any) {
        setLocal(prev);
        onError?.(err?.response?.data?.error || "Error al actualizar módulos");
      }
    });
  }

  function toggleModule(key: string, currentlyOn: boolean) {
    if (isPending) return;
    const aliases = MODULE_ALIASES[key] ?? [key];
    // Limpia cualquier alias previo para evitar duplicados; al activar
    // guarda solo la forma UPPERCASE canónica.
    const cleaned = local.enabledModules.filter(m => !aliases.includes(m));
    const next = currentlyOn ? cleaned : [...cleaned, key];
    persist({ enabledModules: next });
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

  const allowedByPlan = plan?.allowedModules ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: isPending ? 0.65 : 1 }}>
      {plan?.displayName && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--text3)" }}>
          <span style={{ textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700 }}>Plan</span>
          <span style={{
            fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 13,
            color: "var(--orange)", background: "var(--orange-dim)",
            border: "1px solid var(--orange-glow)",
            padding: "2px 10px", borderRadius: 999,
          }}>{plan.displayName}</span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {UI_MODULES.map((m) => {
          const allowed = matchAny(m.key, allowedByPlan);
          const on = matchAny(m.key, local.enabledModules);
          return (
            <div
              key={m.key}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 12px", borderRadius: 12,
                background: on ? "var(--orange-dim)" : "var(--surface2)",
                border: `1px solid ${on ? "var(--orange-glow)" : "var(--border)"}`,
                opacity: allowed ? 1 : 0.7,
              }}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "var(--surface3)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, flexShrink: 0,
              }}>{m.icon}</div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>{m.label}</span>
                  {!allowed && (
                    <span style={{
                      fontSize: 9, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase",
                      color: "var(--amber)", background: "var(--amber-dim)",
                      border: "1px solid var(--amber-dim)",
                      padding: "1px 6px", borderRadius: 999,
                    }}>Upgrade</span>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "var(--text3)", margin: "2px 0 0", lineHeight: 1.35 }}>
                  {m.description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={`${m.label}: ${on ? "activo" : "inactivo"}`}
                disabled={!allowed || isPending}
                onClick={() => toggleModule(m.key, on)}
                style={{
                  position: "relative", width: 44, height: 24, borderRadius: 999,
                  background: on ? "var(--orange)" : "var(--surface3)",
                  border: `1px solid ${on ? "var(--orange)" : "var(--border)"}`,
                  flexShrink: 0, cursor: allowed && !isPending ? "pointer" : "not-allowed",
                  transition: "background .15s",
                }}
              >
                <span style={{
                  position: "absolute", top: 2, left: on ? "calc(100% - 21px)" : 2,
                  width: 18, height: 18, borderRadius: "50%",
                  background: "#fff",
                  transition: "left .18s cubic-bezier(0.32, 0.72, 0, 1)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }} />
              </button>
            </div>
          );
        })}
      </div>

      {/* WhatsApp editor */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, paddingTop: 10,
        borderTop: "1px solid var(--border)",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "var(--text3)" }}>
          WhatsApp
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
                padding: "5px 10px", fontSize: 11, color: "var(--text)", outline: "none",
                fontFamily: "DM Mono, monospace", flex: 1, minWidth: 0,
              }}
            />
            <button
              onClick={saveWhatsapp}
              disabled={isPending}
              className="db-btn db-btn-orange"
              style={{ padding: "5px 10px", fontSize: 11 }}
            >
              OK
            </button>
          </>
        ) : (
          <button
            onClick={() => { setWhatsappDraft(local.whatsappNumber ?? ""); setEditingPhone(true); }}
            className="db-btn"
            style={{
              padding: "5px 10px", fontSize: 11, fontFamily: "DM Mono, monospace",
              color: local.whatsappNumber ? "var(--text2)" : "var(--text3)",
            }}
            title="Editar mensajería"
          >
            {local.whatsappNumber ? `📱 ${local.whatsappNumber}` : "+ Agregar"}
          </button>
        )}
      </div>
    </div>
  );
}
