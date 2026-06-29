"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

interface OtaBundle {
  id: string;
  appId: string;
  version: string;
  channel: string;
  storagePath: string;
  checksum: string;
  sizeBytes: number;
  notes: string | null;
  isActive: boolean;
  minNative: string | null;
  createdAt: string;
}

const CHANNELS = ["production", "beta", "dev"] as const;
type Channel = typeof CHANNELS[number];

const OTA_APPS = [
  { key: "tpv", label: "TPV", appId: "com.mrtpvrest.tpv", path: "apps/tpv/" },
  { key: "delivery", label: "Delivery", appId: "com.mrtpvrest.delivery", path: "apps/delivery/" },
  { key: "kiosk", label: "Kiosk", appId: "com.mrtpvrest.kiosk", path: "apps/kiosk/" },
  { key: "kds", label: "KDS", appId: "com.mrtpvrest.kds", path: "apps/kds/" },
  { key: "meseros-lite", label: "Meseros Lite", appId: "com.mrtpvrest.meseroslite", path: "apps/meseros-lite/" },
  { key: "inventario", label: "Inventario", appId: "com.mrtpvrest.inventario", path: "apps/inventario/" },
] as const;
type OtaAppKey = typeof OTA_APPS[number]["key"];

const CHANNEL_BADGE: Record<Channel, string> = {
  production: "db-badge-green",
  beta: "db-badge-amber",
  dev: "db-badge-blue",
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-MX", { month: "short", day: "numeric" });
}

export default function TpvUpdatesPage() {
  const [appKey, setAppKey] = useState<OtaAppKey>("tpv");
  const [channel, setChannel] = useState<Channel>("production");
  const [bundles, setBundles] = useState<OtaBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [showTrigger, setShowTrigger] = useState(false);
  const [triggerNotes, setTriggerNotes] = useState("");
  const [toast, setToast] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<OtaBundle | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedApp = OTA_APPS.find((app) => app.key === appKey) || OTA_APPS[0];

  function showToast(msg: string) {
    if (timer.current) clearTimeout(timer.current);
    setToast(msg);
    timer.current = setTimeout(() => setToast(""), 3000);
  }

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get<{ bundles: OtaBundle[] }>("/api/ota/bundles", {
        params: { channel, appId: selectedApp.appId },
      });
      setBundles(data.bundles || []);
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error cargando bundles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [appKey, channel]);

  async function triggerBuild() {
    setTriggering(true);
    try {
      const { data } = await api.post("/api/ota/trigger-build", {
        appId: selectedApp.appId,
        channel,
        notes: triggerNotes || undefined,
      });
      showToast(`Build disparado: ${selectedApp.label} · ${channel}`);
      setShowTrigger(false);
      setTriggerNotes("");
      // El workflow tarda 3-5 min. Recargamos en 30s para empezar a ver.
      setTimeout(load, 30000);
      if (data?.actionsUrl) {
        window.open(data.actionsUrl, "_blank", "noopener");
      }
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error disparando build");
    } finally {
      setTriggering(false);
    }
  }

  async function rollback(bundle: OtaBundle) {
    try {
      await api.delete(`/api/ota/bundles/${bundle.id}`);
      showToast(`v${bundle.version} desactivada`);
      setConfirmDelete(null);
      await load();
    } catch (err: any) {
      showToast(err?.response?.data?.error || "Error en rollback");
    }
  }

  const activeBundle = bundles.find((b) => b.isActive);

  return (
    <div className="db-container">
      <header className="db-page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="db-page-title">OTA Updates</h1>
          <p className="db-page-subtitle">
            Live updates del bundle web. Cada push a <code>{selectedApp.path}</code> en master genera un release automaticamente.
          </p>
        </div>
        <button
          className="db-btn-primary"
          onClick={() => setShowTrigger(true)}
          disabled={triggering}
        >
          {triggering ? "Disparando…" : "+ Publicar versión ahora"}
        </button>
      </header>

      {/* App and channel selector */}
      <div className="db-card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="db-label">App:</span>
        {OTA_APPS.map((app) => (
          <button
            key={app.key}
            onClick={() => setAppKey(app.key)}
            className={`db-chip ${appKey === app.key ? "db-chip-active" : ""}`}
            style={{ fontSize: 11, fontWeight: 700 }}
          >
            {app.label}
          </button>
        ))}
        <span className="db-label" style={{ marginLeft: 12 }}>Canal:</span>
        {CHANNELS.map((c) => (
          <button
            key={c}
            onClick={() => setChannel(c)}
            className={`db-chip ${channel === c ? "db-chip-active" : ""}`}
            style={{ textTransform: "uppercase", fontSize: 11, fontWeight: 700 }}
          >
            {c}
          </button>
        ))}
        <button
          onClick={load}
          className="db-btn-ghost"
          style={{ marginLeft: "auto", fontSize: 12 }}
          disabled={loading}
        >
          {loading ? "Cargando…" : "↻ Refrescar"}
        </button>
      </div>

      {/* Versión activa actual */}
      {activeBundle && (
        <div
          className="db-card"
          style={{
            padding: 20,
            marginBottom: 24,
            background: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))",
            border: "1px solid rgba(34,197,94,0.25)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span className="db-badge-green">EN VIVO</span>
            <span style={{ fontSize: 24, fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
              v{activeBundle.version}
            </span>
            <span style={{ color: "var(--text-muted, #888)", fontSize: 12 }}>
              {timeAgo(activeBundle.createdAt)} · {formatBytes(activeBundle.sizeBytes)}
            </span>
          </div>
          {activeBundle.notes && (
            <p style={{ margin: 0, color: "var(--text-secondary, #aaa)", fontSize: 13 }}>
              {activeBundle.notes}
            </p>
          )}
        </div>
      )}

      {/* Tabla de bundles */}
      <div className="db-card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="db-table">
          <thead>
            <tr>
              <th>Versión</th>
              <th>Canal</th>
              <th>Tamaño</th>
              <th>Notas</th>
              <th>Publicado</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                  Cargando bundles…
                </td>
              </tr>
            )}
            {!loading && bundles.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 32, color: "var(--text-muted)" }}>
                  No hay bundles publicados para <strong>{selectedApp.label}</strong> en el canal <strong>{channel}</strong>.
                </td>
              </tr>
            )}
            {bundles.map((b) => (
              <tr key={b.id} style={{ opacity: b.isActive ? 1 : 0.5 }}>
                <td style={{ fontFamily: "var(--font-mono, monospace)", fontWeight: 600 }}>
                  v{b.version}
                </td>
                <td>
                  <span className={CHANNEL_BADGE[b.channel as Channel] || "db-badge"}>
                    {b.channel}
                  </span>
                </td>
                <td style={{ color: "var(--text-secondary)" }}>{formatBytes(b.sizeBytes)}</td>
                <td style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.notes || <span style={{ color: "var(--text-muted)" }}>—</span>}
                </td>
                <td style={{ color: "var(--text-secondary)", fontSize: 12 }}>{timeAgo(b.createdAt)}</td>
                <td>
                  {b.isActive ? (
                    <span className="db-badge-green">Activa</span>
                  ) : (
                    <span className="db-badge">Desactivada</span>
                  )}
                </td>
                <td>
                  {b.isActive && (
                    <button
                      className="db-btn-ghost db-btn-sm"
                      onClick={() => setConfirmDelete(b)}
                      title="Desactivar (los TPVs vuelven a la anterior activa)"
                    >
                      Rollback
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal: trigger build manual */}
      {showTrigger && (
        <div className="db-modal-backdrop" onClick={() => !triggering && setShowTrigger(false)}>
          <div className="db-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <h2 style={{ marginTop: 0 }}>Publicar versión ahora</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              Dispara el workflow de GitHub Actions que builda {selectedApp.label} y lo publica en el canal{" "}
              <strong>{channel}</strong>. Tarda 3-5 minutos.
            </p>
            <div style={{ marginTop: 16 }}>
              <label className="db-label">Notas (opcional)</label>
              <textarea
                value={triggerNotes}
                onChange={(e) => setTriggerNotes(e.target.value)}
                placeholder="Ej. Fix botón delivery + nuevos modificadores"
                className="db-input"
                rows={3}
                disabled={triggering}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button
                className="db-btn-ghost"
                onClick={() => setShowTrigger(false)}
                disabled={triggering}
              >
                Cancelar
              </button>
              <button
                className="db-btn-primary"
                onClick={triggerBuild}
                disabled={triggering}
              >
                {triggering ? "Disparando…" : "Disparar build"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: confirm rollback */}
      {confirmDelete && (
        <div className="db-modal-backdrop" onClick={() => setConfirmDelete(null)}>
          <div className="db-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h2 style={{ marginTop: 0 }}>Rollback de v{confirmDelete.version}</h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              Esta versión se marcará como inactiva y los TPVs volverán a la anterior activa en el siguiente check.
              El zip se borra del storage. <strong>No es reversible</strong> — para volver tendrías que re-publicar.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
              <button className="db-btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancelar
              </button>
              <button className="db-btn-danger" onClick={() => rollback(confirmDelete)}>
                Sí, hacer rollback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="db-toast" style={{ position: "fixed", bottom: 24, right: 24 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
