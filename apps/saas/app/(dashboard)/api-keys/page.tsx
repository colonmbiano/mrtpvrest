"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

interface ApiKey {
  id: string;
  tenantId: string | null;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
  requests24h: number;
  // Sólo presente justo tras crearla (one-time reveal).
  key?: string;
}

const SCOPES = ["orders:read","orders:write","menu:read","menu:write","reports:read","webhooks"];

function mask(prefix: string) {
  return `${prefix}${"•".repeat(16)}`;
}

export default function ApiKeysPage() {
  const [keys, setKeys]         = useState<ApiKey[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string>("");

  const [showNew, setShowNew]     = useState(false);
  const [newName, setNewName]     = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["orders:read"]);
  const [creating, setCreating]   = useState(false);

  // Para mostrar la key recién creada (one-time reveal)
  const [createdKey, setCreatedKey] = useState<{ key: string; name: string } | null>(null);

  const [copied, setCopied]     = useState<string | null>(null);
  const [toast, setToast]       = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg); timer.current = setTimeout(() => setToast(""), 2500);
  }

  async function load() {
    setLoading(true); setError("");
    try {
      const { data } = await api.get<ApiKey[]>("/api/saas/api-keys");
      setKeys(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Error al cargar API keys");
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createKey() {
    if (!newName.trim() || newScopes.length === 0 || creating) return;
    setCreating(true);
    try {
      const { data } = await api.post<ApiKey>("/api/saas/api-keys", {
        name: newName,
        scopes: newScopes,
      });
      setShowNew(false);
      setNewName("");
      setNewScopes(["orders:read"]);
      if (data.key) setCreatedKey({ key: data.key, name: data.name });
      showToast("API Key creada");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al crear la key");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(id: string) {
    if (!confirm("¿Revocar esta API key? La acción es inmediata.")) return;
    try {
      await api.delete(`/api/saas/api-keys/${id}`);
      showToast("API Key revocada");
      load();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al revocar");
    }
  }

  function copyKey(id: string, key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(id); setTimeout(() => setCopied(null), 2000);
    });
  }

  function toggleScope(s: string) {
    setNewScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  }

  function timeAgo(iso: string) {
    const ms = Date.now() - new Date(iso).getTime();
    const h = Math.floor(ms / 3_600_000);
    const d = Math.floor(ms / 86_400_000);
    if (h < 1) return "hace <1h";
    if (h < 24) return `hace ${h}h`;
    if (d < 7)  return `hace ${d}d`;
    return new Date(iso).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
  }

  const activeKeys  = keys.filter(k => k.active);
  const revokedKeys = keys.filter(k => !k.active);
  const uniqueScopes = new Set(keys.flatMap(k => k.scopes)).size;

  return (
    <>
      <div className="db-topbar">
        <div className="db-topbar-left">
          <h1>API Keys</h1>
          <p>Gestión de claves de acceso para integraciones externas</p>
        </div>
        <div className="db-topbar-right">
          <button className="db-btn db-btn-orange" onClick={() => setShowNew(true)}>+ Nueva API Key</button>
        </div>
      </div>

      <div className="db-content">
        {/* METRICS */}
        <div className="db-metrics">
          {[
            { l:"Keys activas",  v: activeKeys.length,  c:"c-green",  s:"en uso" },
            { l:"Keys totales",  v: keys.length,        c:"c-blue",   s:"creadas" },
            { l:"Revocadas",     v: revokedKeys.length, c:"c-orange", s:"inactivas" },
            { l:"Scopes únicos", v: uniqueScopes,       c:"c-amber",  s:"permisos" },
          ].map(({l,v,c,s}) => (
            <div key={l} className={`db-metric-card ${c}`}>
              <div className="db-metric-label">{l}</div>
              <div className="db-metric-value">{v}</div>
              <div className="db-metric-footer"><span className="db-metric-sub">{s}</span></div>
            </div>
          ))}
        </div>

        {/* KEYS TABLE */}
        <div className="db-card">
          <div className="db-card-header">
            <div className="db-card-title">API Keys</div>
            {error && <span className="db-badge db-badge-red" style={{ fontSize:9 }}>{error}</span>}
          </div>
          <table className="db-brands-table">
            <thead>
              <tr>
                <th>Nombre</th><th>Key</th><th>Scopes</th>
                <th>Creada</th><th>Último uso</th><th>Estado</th><th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--text3)" }}>Cargando…</td></tr>
              )}
              {!loading && keys.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 36, textAlign: "center", color: "var(--text3)" }}>
                  Sin API keys emitidas. Crea la primera con “+ Nueva API Key”.
                </td></tr>
              )}
              {keys.map(k => (
                <tr key={k.id} style={{ opacity: k.active ? 1 : 0.45 }}>
                  <td style={{ fontWeight:500 }}>{k.name}</td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontFamily:"DM Mono,monospace", fontSize:11, color:"var(--text3)" }}>
                        {mask(k.prefix)}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {k.scopes.length === 0
                        ? <span style={{ fontSize: 11, color: "var(--text3)" }}>—</span>
                        : k.scopes.map(s => (
                          <span key={s} className="db-badge db-badge-blue" style={{ fontSize:9 }}>{s}</span>
                        ))}
                    </div>
                  </td>
                  <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text3)" }}>{timeAgo(k.createdAt)}</td>
                  <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text3)" }}>
                    {k.lastUsedAt ? timeAgo(k.lastUsedAt) : "Nunca"}
                  </td>
                  <td>
                    <span className={`db-badge ${k.active ? "db-badge-green" : "db-badge-red"}`}>
                      {k.active ? "Activa" : "Revocada"}
                    </span>
                  </td>
                  <td>
                    {k.active && (
                      <button className="db-btn" style={{ padding:"3px 8px", fontSize:10, color:"var(--red)", borderColor:"var(--red-dim)" }}
                        onClick={() => revokeKey(k.id)}>Revocar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL NUEVA KEY */}
      {showNew && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:50 }}>
          <div className="db-card" style={{ width:420 }}>
            <div className="db-card-header">
              <div className="db-card-title">Nueva API Key</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div className="db-field">
                <label>Nombre descriptivo</label>
                <div className="db-field-wrap">
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Integración Rappi" />
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:"var(--text3)", letterSpacing:1, textTransform:"uppercase", marginBottom:8 }}>Permisos (scopes)</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                  {SCOPES.map(s => (
                    <label key={s} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, cursor:"pointer",
                      background: newScopes.includes(s) ? "var(--blue-dim)" : "var(--surface2)",
                      border:`1px solid ${newScopes.includes(s) ? "var(--blue)" : "var(--border)"}` }}>
                      <input type="checkbox" checked={newScopes.includes(s)} onChange={() => toggleScope(s)}
                        style={{ accentColor:"var(--blue)" }} />
                      <span style={{ fontSize:11, fontFamily:"DM Mono,monospace", color: newScopes.includes(s) ? "var(--blue)" : "var(--text2)" }}>{s}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div style={{ background:"var(--amber-dim)", border:"1px solid var(--amber-dim)", borderRadius:8, padding:"10px 12px" }}>
                <p style={{ fontSize:11, color:"var(--amber)", lineHeight:1.5 }}>
                  ⚠️ La clave se mostrará una sola vez. Guárdala en un lugar seguro.
                </p>
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="db-btn" style={{ flex:1 }} onClick={() => setShowNew(false)} disabled={creating}>Cancelar</button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }} onClick={createKey}
                  disabled={!newName.trim() || newScopes.length === 0 || creating}>
                  {creating ? "Generando…" : "Generar key"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONE-TIME REVEAL */}
      {createdKey && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.75)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:60 }}>
          <div className="db-card" style={{ width:520 }}>
            <div className="db-card-header">
              <div className="db-card-title">Clave generada: {createdKey.name}</div>
            </div>
            <div className="db-card-body" style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <p style={{ fontSize:12, color:"var(--text2)", lineHeight:1.5 }}>
                Copia la clave ahora. No volverá a mostrarse — si la pierdes, tendrás que revocarla y emitir una nueva.
              </p>
              <div style={{
                background:"var(--surface2)", border:"1px solid var(--border)", borderRadius:8,
                padding:"10px 12px", fontFamily:"DM Mono,monospace", fontSize:12, color:"var(--text)", wordBreak:"break-all"
              }}>
                {createdKey.key}
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button className="db-btn" style={{ flex:1 }}
                  onClick={() => copyKey("__new", createdKey.key)}>
                  {copied === "__new" ? "Copiado ✓" : "Copiar clave"}
                </button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }}
                  onClick={() => { setCreatedKey(null); setCopied(null); }}>
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`db-toast ${toast ? "show" : ""}`}>{toast}</div>
    </>
  );
}
