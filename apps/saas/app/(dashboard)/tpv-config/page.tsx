"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";

const ORDER_TYPE_OPTS: { v: string; l: string }[] = [
  { v: "DINE_IN",  l: "Mesa" },
  { v: "TAKEOUT",  l: "Llevar" },
  { v: "DELIVERY", l: "Domicilio" },
];

interface ConfigPayload {
  apiUrl:            string | null;
  allowedOrderTypes: string[];
  lockTimeoutSec:    number;
  accentColor:       string | null;
  extra:             Record<string, unknown>;
  updatedAt:         string | null;
}

interface Row {
  locationId: string;
  locationName: string;
  locationSlug: string;
  businessType: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  tenantId: string | null;
  tenantName: string | null;
  config: ConfigPayload | null;
}

const DEFAULTS: ConfigPayload = {
  apiUrl:            null,
  allowedOrderTypes: ["DINE_IN", "TAKEOUT", "DELIVERY"],
  lockTimeoutSec:    0,
  accentColor:       null,
  extra:             {},
  updatedAt:         null,
};

export default function TpvConfigPage() {
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [toast, setToast]     = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(""), 2500);
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<Row[]>("/api/saas/tpv-configs");
      setRows(data || []);
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error al cargar sucursales");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r =>
      r.locationName.toLowerCase().includes(q) ||
      r.restaurantName.toLowerCase().includes(q) ||
      (r.tenantName || "").toLowerCase().includes(q) ||
      r.locationSlug.toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>TPV Config</h1>
          <p>Configuración remota por sucursal — el TPV la lee al arrancar sin reinstalar APK</p>
        </div>
        <div className="db-topbar-right">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar marca o sucursal…"
            style={{ background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
              padding:"6px 12px", fontSize:12, color:"var(--text)", outline:"none", width:240 }} />
        </div>
      </div>

      <div className="db-content">
        <div className="db-card">
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Cargando…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text3)", fontSize: 13 }}>Sin sucursales</div>
          ) : (
            <table className="db-brands-table">
              <thead>
                <tr>
                  <th>Sucursal</th><th>Giro</th><th>Config</th><th>Últ. cambio</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.locationId}>
                    <td>
                      <div style={{ fontWeight: 500 }}>{r.locationName}</div>
                      <div style={{ fontSize: 10, color: "var(--text3)", fontFamily: "DM Mono,monospace" }}>
                        {r.restaurantName}{r.tenantName && r.tenantName !== r.restaurantName ? ` · ${r.tenantName}` : ""}
                      </div>
                    </td>
                    <td style={{ fontSize: 11, color: "var(--text2)" }}>{r.businessType}</td>
                    <td>
                      {r.config ? (
                        <ConfigSummary cfg={r.config} />
                      ) : (
                        <span className="db-badge db-badge-blue">Defaults</span>
                      )}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: "DM Mono,monospace", color: "var(--text3)" }}>
                      {r.config?.updatedAt ? new Date(r.config.updatedAt).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" }) : "—"}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="db-btn db-btn-orange" style={{ padding: "3px 10px", fontSize: 10 }}
                        onClick={() => setEditRow(r)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editRow && (
        <EditDrawer row={editRow} onClose={() => setEditRow(null)}
          onSaved={async (msg) => { await load(); showToast(msg); setEditRow(null); }} />
      )}

      <div className={`db-toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}

function ConfigSummary({ cfg }: { cfg: ConfigPayload }) {
  const bits: string[] = [];
  if (cfg.apiUrl)            bits.push(`URL: ${shortUrl(cfg.apiUrl)}`);
  if (cfg.allowedOrderTypes.length < 3) bits.push(`Tipos: ${cfg.allowedOrderTypes.join("/")}`);
  if (cfg.lockTimeoutSec > 0) bits.push(`Lock: ${cfg.lockTimeoutSec}s`);
  if (cfg.accentColor)       bits.push(`Color: ${cfg.accentColor}`);
  if (bits.length === 0) return <span className="db-badge db-badge-blue">Defaults</span>;
  return <span style={{ fontSize: 11, color: "var(--text2)", fontFamily: "DM Mono,monospace" }}>{bits.join(" · ")}</span>;
}

function shortUrl(u: string) {
  try { return new URL(u).host; } catch { return u; }
}

function EditDrawer({ row, onClose, onSaved }: {
  row: Row;
  onClose: () => void;
  onSaved: (msg: string) => void | Promise<void>;
}) {
  const initial: ConfigPayload = row.config ?? DEFAULTS;
  const [apiUrl, setApiUrl]                       = useState(initial.apiUrl || "");
  const [allowedOrderTypes, setAllowedOrderTypes] = useState<string[]>(initial.allowedOrderTypes);
  const [lockTimeoutSec, setLockTimeoutSec]       = useState<number>(initial.lockTimeoutSec || 0);
  const [accentColor, setAccentColor]             = useState(initial.accentColor || "");
  const [extraText, setExtraText]                 = useState(JSON.stringify(initial.extra ?? {}, null, 2));
  const [error, setError]                         = useState("");
  const [saving, setSaving]                       = useState(false);

  function toggleOrderType(v: string) {
    setAllowedOrderTypes(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  async function save() {
    setError("");
    if (apiUrl.trim() && !/^https?:\/\//i.test(apiUrl.trim())) {
      setError("El servidor debe iniciar con http:// o https://");
      return;
    }
    if (accentColor.trim() && !/^#[0-9a-fA-F]{3,8}$/.test(accentColor.trim())) {
      setError("El color de acento debe ser hex (ej. #F5C842)");
      return;
    }
    if (allowedOrderTypes.length === 0) {
      setError("Debes permitir al menos un tipo de orden");
      return;
    }
    let extra: Record<string, unknown> = {};
    try {
      const parsed = extraText.trim() ? JSON.parse(extraText) : {};
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
      extra = parsed;
    } catch {
      setError("El JSON de campo 'extra' no es válido");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/api/saas/tpv-configs/${row.locationId}`, {
        apiUrl:            apiUrl.trim() || null,
        allowedOrderTypes,
        lockTimeoutSec:    Number(lockTimeoutSec) || 0,
        accentColor:       accentColor.trim() || null,
        extra,
      });
      await onSaved("Config guardada");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefaults() {
    if (!confirm("¿Borrar la config custom y dejar esta sucursal con valores default?")) return;
    setSaving(true);
    try {
      await api.delete(`/api/saas/tpv-configs/${row.locationId}`);
      await onSaved("Config restablecida");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al restablecer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 50,
      display: "flex", alignItems: "stretch", justifyContent: "flex-end",
    }} onClick={onClose}>
      <div className="db-card" style={{ width: 440, maxWidth: "100%", height: "100%", borderRadius: 0, display: "flex", flexDirection: "column" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="db-card-header" style={{ flexShrink: 0 }}>
          <div>
            <div className="db-card-title">Editar TPV Config</div>
            <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 2 }}>
              {row.restaurantName} · <b>{row.locationName}</b>
            </div>
          </div>
          <button onClick={onClose} className="db-btn" style={{ padding: "3px 8px", fontSize: 12 }}>✕</button>
        </div>
        <div className="db-card-body" style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>

          <Field label="Servidor (apiUrl)" hint="URL base del backend que este TPV debe consultar. Déjalo vacío para usar el default baked en el APK.">
            <input type="text" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              placeholder="https://api.mrtpvrest.com" style={inputStyle} />
          </Field>

          <Field label="Tipos de orden permitidos" hint="Qué tabs aparecen al cajero. Una dark kitchen normalmente deja solo DELIVERY.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ORDER_TYPE_OPTS.map(opt => {
                const checked = allowedOrderTypes.includes(opt.v);
                return (
                  <label key={opt.v} style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", borderRadius: 8, cursor: "pointer",
                    background: checked ? "var(--orange-dim)" : "var(--surface2)",
                    border: `1px solid ${checked ? "var(--orange)" : "var(--border)"}`,
                    fontSize: 11,
                  }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleOrderType(opt.v)} style={{ accentColor: "var(--orange)" }} />
                    {opt.l}
                  </label>
                );
              })}
            </div>
          </Field>

          <Field label="Auto-bloqueo por inactividad (seg)" hint="0 = desactivado. Al pasar N segundos sin interacción la caja se bloquea y requiere PIN de nuevo.">
            <input type="number" min={0} max={86400} value={lockTimeoutSec}
              onChange={e => setLockTimeoutSec(Number(e.target.value))} style={inputStyle} />
          </Field>

          <Field label="Color de acento (hex)" hint="Override del color dorado por defecto del TPV. Útil para white-label.">
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                placeholder="#F5C842" style={{ ...inputStyle, flex: 1 }} />
              {accentColor && (
                <div style={{ width: 28, height: 28, borderRadius: 6, background: accentColor, border: "1px solid var(--border)" }} />
              )}
            </div>
          </Field>

          <Field label="Extra (JSON)" hint="Para flags futuros sin tocar schema. Debe ser un objeto.">
            <textarea value={extraText} onChange={e => setExtraText(e.target.value)}
              rows={6} style={{ ...inputStyle, fontFamily: "DM Mono,monospace", resize: "vertical" }} />
          </Field>

          {error && <div style={{ fontSize: 12, color: "var(--red)" }}>{error}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 14 }}>
            <button className="db-btn" style={{ flex: 1 }} onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="db-btn db-btn-orange" style={{ flex: 1 }} onClick={save} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {row.config && (
            <button className="db-btn" style={{ color: "var(--red)", borderColor: "var(--red-dim)" }}
              onClick={resetToDefaults} disabled={saving}>
              Restablecer a defaults
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{label}</label>
      {hint && <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 2, marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 13,
  color: "var(--text)",
  outline: "none",
  width: "100%",
};
