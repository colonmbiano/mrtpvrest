"use client";
import { useState, useRef } from "react";

interface ApiKey {
  id: string; name: string; key: string; scopes: string[];
  createdAt: string; lastUsed: string | null; active: boolean;
}

const SCOPES = ["orders:read","orders:write","menu:read","menu:write","reports:read","webhooks"];

function genKey() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const part = (n: number) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `mrtp_${part(8)}_${part(16)}_${part(8)}`;
}

function mask(key: string) {
  return key.slice(0, 12) + "••••••••••••••••" + key.slice(-4);
}

export default function ApiKeysPage() {
  const [keys,     setKeys]     = useState<ApiKey[]>([
    { id:"1", name:"Producción TPV", key: genKey(), scopes:["orders:read","orders:write","menu:read"], createdAt: new Date(Date.now()-15*86400000).toISOString(), lastUsed: new Date(Date.now()-3600000).toISOString(), active:true },
    { id:"2", name:"Integración Rappi", key: genKey(), scopes:["orders:read","webhooks"], createdAt: new Date(Date.now()-5*86400000).toISOString(), lastUsed: null, active:true },
  ]);
  const [showNew,   setShowNew]   = useState(false);
  const [newName,   setNewName]   = useState("");
  const [newScopes, setNewScopes] = useState<string[]>(["orders:read"]);
  const [revealed,  setRevealed]  = useState<string | null>(null);
  const [copied,    setCopied]    = useState<string | null>(null);
  const [toast,     setToast]     = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg); timer.current = setTimeout(() => setToast(""), 2500);
  }

  function createKey() {
    if (!newName.trim() || newScopes.length === 0) return;
    const key: ApiKey = { id: Date.now().toString(), name: newName, key: genKey(),
      scopes: newScopes, createdAt: new Date().toISOString(), lastUsed: null, active: true };
    setKeys(prev => [key, ...prev]);
    setShowNew(false); setNewName(""); setNewScopes(["orders:read"]);
    showToast("API Key creada");
  }

  function revokeKey(id: string) {
    setKeys(prev => prev.map(k => k.id === id ? { ...k, active: false } : k));
    showToast("API Key revocada");
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
    const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
    if (h < 1) return "hace <1h"; if (h < 24) return `hace ${h}h`; if (d < 7) return `hace ${d}d`;
    return new Date(iso).toLocaleDateString("es-MX", { day:"2-digit", month:"short" });
  }

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
            { l:"Keys activas",   v: keys.filter(k=>k.active).length,  c:"c-green", s:"en uso" },
            { l:"Keys totales",   v: keys.length,                        c:"c-blue",  s:"creadas" },
            { l:"Revocadas",      v: keys.filter(k=>!k.active).length,  c:"c-orange",s:"inactivas" },
            { l:"Scopes únicos",  v: new Set(keys.flatMap(k=>k.scopes)).size, c:"c-amber", s:"permisos" },
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
            <span className="db-badge db-badge-amber" style={{ fontSize:9 }}>Datos locales — backend pendiente</span>
          </div>
          <table className="db-brands-table">
            <thead>
              <tr><th>Nombre</th><th>Key</th><th>Scopes</th><th>Creada</th><th>Último uso</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id} style={{ opacity: k.active ? 1 : 0.45 }}>
                  <td style={{ fontWeight:500 }}>{k.name}</td>
                  <td>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontFamily:"DM Mono,monospace", fontSize:11, color:"var(--text3)" }}>
                        {revealed === k.id ? k.key : mask(k.key)}
                      </span>
                      <button className="db-btn" style={{ padding:"2px 7px", fontSize:10 }}
                        onClick={() => setRevealed(prev => prev === k.id ? null : k.id)}>
                        {revealed === k.id ? "Ocultar" : "Ver"}
                      </button>
                      <button className="db-btn" style={{ padding:"2px 7px", fontSize:10, color: copied===k.id ? "var(--green)" : "var(--text2)" }}
                        onClick={() => copyKey(k.id, k.key)}>
                        {copied === k.id ? "✓" : "Copiar"}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {k.scopes.map(s => (
                        <span key={s} className="db-badge db-badge-blue" style={{ fontSize:9 }}>{s}</span>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text3)" }}>{timeAgo(k.createdAt)}</td>
                  <td style={{ fontSize:11, fontFamily:"DM Mono,monospace", color:"var(--text3)" }}>
                    {k.lastUsed ? timeAgo(k.lastUsed) : "Nunca"}
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
                <button className="db-btn" style={{ flex:1 }} onClick={() => setShowNew(false)}>Cancelar</button>
                <button className="db-btn db-btn-orange" style={{ flex:1 }} onClick={createKey}
                  disabled={!newName.trim() || newScopes.length === 0}>
                  Generar key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className={`db-toast ${toast?"show":""}`}>{toast}</div>
    </>
  );
}
