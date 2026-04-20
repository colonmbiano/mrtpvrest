"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type KeyStatus = {
  configured: boolean;
  decryptable: boolean;
  masked: string | null;
  validatedAt: string | null;
  trialActive: boolean;
  trialEndsAt: string | null;
  subscriptionStatus: string | null;
};

export default function AiKeyCard() {
  const [status, setStatus] = useState<KeyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [working, setWorking] = useState<"save" | "delete" | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function load() {
    try {
      const { data } = await api.get("/api/admin/ai-key");
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const clean = input.trim();
    if (!clean) return;
    setWorking("save");
    setMsg(null);
    try {
      await api.post("/api/admin/ai-key", { apiKey: clean });
      setInput("");
      setShowInput(false);
      setMsg({ text: "API key guardada y validada.", ok: true });
      await load();
    } catch (err: any) {
      setMsg({ text: err?.response?.data?.error || "No se pudo guardar.", ok: false });
    } finally {
      setWorking(null);
    }
  }

  async function remove() {
    if (!confirm("¿Seguro que quieres borrar la API key? Las funciones IA dejarán de funcionar (o usarán la cortesía de plataforma si sigues en trial).")) return;
    setWorking("delete");
    setMsg(null);
    try {
      await api.delete("/api/admin/ai-key");
      setMsg({ text: "API key eliminada.", ok: true });
      await load();
    } catch (err: any) {
      setMsg({ text: err?.response?.data?.error || "No se pudo eliminar.", ok: false });
    } finally {
      setWorking(null);
    }
  }

  const daysLeft = status?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(status.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const banner = (() => {
    if (!status) return null;
    if (status.configured && !status.decryptable) {
      return { tone: "err", text: "La API key guardada no se puede desencriptar (probablemente se rotó AI_ENCRYPTION_KEY). Vuelve a capturarla." };
    }
    if (status.configured) {
      return { tone: "ok", text: `Activa: ${status.masked}${status.validatedAt ? ` · validada ${new Date(status.validatedAt).toLocaleDateString("es-MX")}` : ""}` };
    }
    if (status.trialActive) {
      return { tone: "warn", text: `Usando la cortesía de plataforma durante el trial${daysLeft != null ? ` (${daysLeft} día${daysLeft === 1 ? "" : "s"} restantes)` : ""}. Configura tu propia key antes de que expire.` };
    }
    return { tone: "err", text: "Sin API key. Las funciones IA (asistente, escaneo de menú e inventario) están desactivadas hasta que configures una." };
  })();

  const toneBg: Record<string, string> = {
    ok: "rgba(16,185,129,.10)",
    warn: "rgba(245,158,11,.10)",
    err: "rgba(239,68,68,.10)",
  };
  const toneColor: Record<string, string> = {
    ok: "#10b981",
    warn: "#f59e0b",
    err: "#ef4444",
  };

  return (
    <div
      className="mb-8"
      style={{
        background: "#111",
        border: "1px solid #262626",
        borderRadius: "2.5rem",
        padding: "32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: "linear-gradient(135deg,#4285f4,#34a853,#fbbc05,#ea4335)",
            display: "grid", placeItems: "center", fontSize: 28, color: "#fff", fontWeight: 900,
            fontFamily: "'Syne',sans-serif",
          }}>G</div>
          <div>
            <h3 style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", fontFamily: "'Syne',sans-serif" }}>
              Google AI Studio (Gemini)
            </h3>
            <p style={{ color: "#888", fontSize: 13 }}>
              Potencia el asistente del dashboard, el escaneo de menú por imagen y el escaneo de tickets/inventario.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "#888", fontSize: 13 }}>Cargando…</div>
      ) : banner && (
        <div style={{
          padding: "10px 14px",
          borderRadius: 12,
          background: toneBg[banner.tone],
          border: `1px solid ${toneColor[banner.tone]}33`,
          color: toneColor[banner.tone],
          fontSize: 13, fontWeight: 700,
          marginBottom: 16,
        }}>
          {banner.text}
        </div>
      )}

      {msg && (
        <div style={{
          padding: "8px 12px", borderRadius: 10, marginBottom: 12,
          background: msg.ok ? "rgba(16,185,129,.10)" : "rgba(239,68,68,.10)",
          color: msg.ok ? "#10b981" : "#ef4444",
          fontSize: 12, fontWeight: 700,
        }}>{msg.text}</div>
      )}

      {/* Instrucciones paso a paso */}
      <details style={{ marginBottom: 16 }}>
        <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#c4c4de", padding: "8px 0" }}>
          Cómo obtener tu API key gratis (Google AI Studio)
        </summary>
        <ol style={{ color: "#c4c4de", fontSize: 13, lineHeight: 1.8, paddingLeft: 20, marginTop: 8 }}>
          <li>Abre <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" style={{ color: "#7c3aed", textDecoration: "underline" }}>aistudio.google.com/app/apikey</a> e inicia sesión con tu cuenta de Google.</li>
          <li>Acepta los términos si es la primera vez.</li>
          <li>Click en <strong>&quot;Create API key&quot;</strong> → selecciona un proyecto (o crea uno nuevo).</li>
          <li>Copia la key que empieza con <code style={{ background: "#222", padding: "1px 6px", borderRadius: 4 }}>AIza…</code>.</li>
          <li>Pégala aquí abajo y presiona <strong>Validar y guardar</strong>.</li>
        </ol>
        <p style={{ color: "#888", fontSize: 12, marginTop: 8, lineHeight: 1.6 }}>
          El plan gratuito de Gemini Flash incluye 15 solicitudes por minuto y 1,500 por día — más que suficiente para un restaurante. La key se guarda cifrada (AES-256-GCM) en nuestra base de datos y nunca se expone al navegador.
        </p>
      </details>

      {/* Acciones */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        {!showInput ? (
          <button
            onClick={() => setShowInput(true)}
            style={{
              padding: "10px 18px", borderRadius: 10, background: "#7c3aed",
              color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(124,58,237,.35)",
            }}
          >
            {status?.configured ? "Cambiar API key" : "Configurar API key"}
          </button>
        ) : (
          <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}>
            <input
              type="password"
              placeholder="AIza…"
              value={input}
              onChange={e => setInput(e.target.value)}
              autoFocus
              style={{
                flex: 1, padding: "10px 14px", borderRadius: 10,
                background: "#1a1a1a", border: "1px solid #333",
                color: "#fff", fontSize: 13, fontFamily: "'DM Mono',monospace",
              }}
            />
            <button
              disabled={working === "save" || !input.trim()}
              onClick={save}
              style={{
                padding: "10px 18px", borderRadius: 10, background: "#10b981",
                color: "#fff", border: "none", fontWeight: 700, fontSize: 13,
                cursor: working ? "not-allowed" : "pointer", opacity: working === "save" ? 0.6 : 1,
              }}
            >
              {working === "save" ? "Validando…" : "Validar y guardar"}
            </button>
            <button
              onClick={() => { setShowInput(false); setInput(""); setMsg(null); }}
              style={{
                padding: "10px 14px", borderRadius: 10, background: "transparent",
                color: "#888", border: "1px solid #333", fontWeight: 700, fontSize: 13, cursor: "pointer",
              }}
            >Cancelar</button>
          </div>
        )}
        {status?.configured && !showInput && (
          <button
            onClick={remove}
            disabled={working === "delete"}
            style={{
              padding: "10px 14px", borderRadius: 10, background: "transparent",
              color: "#ef4444", border: "1px solid rgba(239,68,68,.3)",
              fontWeight: 700, fontSize: 13, cursor: working ? "not-allowed" : "pointer",
              opacity: working === "delete" ? 0.6 : 1,
            }}
          >
            {working === "delete" ? "Eliminando…" : "Eliminar"}
          </button>
        )}
      </div>
    </div>
  );
}
