"use client";
import { useState, useTransition } from "react";
import api from "@/lib/api";

export interface TenantModulesData {
  id: string;
  hasInventory: boolean;
  hasDelivery: boolean;
  hasWebStore: boolean;
  whatsappNumber: string | null;
}

interface Props {
  tenant: TenantModulesData;
  onUpdated?: (patch: Partial<TenantModulesData>) => void;
  onError?: (msg: string) => void;
}

const TOGGLES: { key: keyof Pick<TenantModulesData, "hasWebStore" | "hasDelivery" | "hasInventory">; label: string; accent: string }[] = [
  { key: "hasWebStore",  label: "Tienda Web", accent: "blue"   },
  { key: "hasDelivery",  label: "Reparto",    accent: "orange" },
  { key: "hasInventory", label: "Inventario", accent: "green"  },
];

export default function TenantModulesToggle({ tenant, onUpdated, onError }: Props) {
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
        setLocal(prev); // revert
        onError?.(err?.response?.data?.error || "Error al actualizar módulos");
      }
    });
  }

  function toggle(key: keyof Pick<TenantModulesData, "hasWebStore" | "hasDelivery" | "hasInventory">) {
    persist({ [key]: !local[key] } as Partial<TenantModulesData>);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 220, opacity: isPending ? 0.6 : 1 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TOGGLES.map(({ key, label, accent }) => {
          const on = local[key];
          return (
            <button
              key={key}
              role="switch"
              aria-checked={on}
              aria-label={label}
              onClick={() => toggle(key)}
              disabled={isPending}
              title={`${label}: ${on ? "activo" : "inactivo"}`}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "3px 8px", borderRadius: 999, fontSize: 10,
                fontFamily: "DM Mono, monospace", cursor: "pointer",
                border: `1px solid ${on ? `var(--${accent})` : "var(--border)"}`,
                background: on ? `var(--${accent}-dim)` : "var(--surface2)",
                color: on ? `var(--${accent})` : "var(--text3)",
                transition: "all .15s",
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: "50%",
                background: on ? `var(--${accent})` : "var(--text3)",
              }} />
              {label}
            </button>
          );
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
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
                background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6,
                padding: "3px 8px", fontSize: 10, color: "var(--text)", outline: "none",
                fontFamily: "DM Mono, monospace", width: 150,
              }}
            />
            <button
              onClick={saveWhatsapp}
              disabled={isPending}
              className="db-btn db-btn-orange"
              style={{ padding: "3px 8px", fontSize: 10 }}
            >
              OK
            </button>
          </>
        ) : (
          <button
            onClick={() => { setWhatsappDraft(local.whatsappNumber ?? ""); setEditingPhone(true); }}
            className="db-btn"
            style={{
              padding: "3px 8px", fontSize: 10, fontFamily: "DM Mono, monospace",
              color: local.whatsappNumber ? "var(--text2)" : "var(--text3)",
            }}
            title="Editar WhatsApp"
          >
            {local.whatsappNumber ? `📱 ${local.whatsappNumber}` : "+ WhatsApp"}
          </button>
        )}
      </div>
    </div>
  );
}
