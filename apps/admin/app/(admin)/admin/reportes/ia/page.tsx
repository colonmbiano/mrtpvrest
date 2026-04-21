"use client";
import { useState, useRef, useEffect } from "react";
import api from "@/lib/api";

/* ── CSS injected once ─────────────────────────────────────── */
const CSS = `
@keyframes ia-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
@keyframes ia-spin  { to{transform:rotate(360deg)} }
@keyframes ia-tp    { 0%,80%,100%{transform:scale(.55);opacity:.35} 40%{transform:scale(1);opacity:1} }
.ia-spark { animation: ia-pulse 2s infinite; }
.ia-spin  { animation: ia-spin  .9s linear infinite; }
.ia-tp    { animation: ia-tp 1.4s infinite; }
.ia-tp:nth-child(2) { animation-delay:.15s; }
.ia-tp:nth-child(3) { animation-delay:.30s; }
.ia-scroll::-webkit-scrollbar { width:4px; }
.ia-scroll::-webkit-scrollbar-track { background:transparent; }
.ia-scroll::-webkit-scrollbar-thumb { background:var(--border2); border-radius:4px; }
`;

/* ── Tokens ────────────────────────────────────────────────── */
const V = {
  iris3:  "#b89eff",
  iris4:  "var(--brand-secondary)",
  iris5:  "var(--brand-primary)",
  irisS:  "rgba(124,58,237,.14)",
  irisG:  "rgba(124,58,237,.35)",
  ok:     "var(--green)",
  okS:    "rgba(16,185,129,.14)",
  warn:   "var(--amber)",
  warnS:  "rgba(245,158,11,.14)",
  err:    "var(--red)",
  errS:   "rgba(239,68,68,.14)",
  surf1:  "var(--surf)",
  surf2:  "var(--surf2)",
  surf3:  "var(--surf3)",
  bd1:    "var(--border)",
  bd2:    "var(--border2)",
  tx:     "var(--text)",
  txHi:   "#fff",
  txMid:  "rgba(200,200,230,.75)",
  txMut:  "var(--muted)",
  txDim:  "var(--muted2)",
};

/* ── Tiny helpers ──────────────────────────────────────────── */
const card = (extra: object = {}): object => ({
  background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 14, ...extra,
});

const btn = (primary?: boolean, ghost?: boolean): object => ({
  padding: "9px 14px", borderRadius: 10,
  border: primary ? "none" : `1px solid ${V.bd1}`,
  background: primary ? V.iris5 : ghost ? V.surf2 : V.surf1,
  color: primary ? "#fff" : V.txMid,
  fontSize: 12, fontWeight: primary ? 600 : 500,
  cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" as const,
  boxShadow: primary ? `0 4px 14px ${V.irisG}` : "none",
});

const monoTag = (): object => ({
  fontFamily: "'DM Mono',monospace", background: V.surf2,
  padding: "2px 7px", borderRadius: 6,
  color: V.iris3, fontSize: 11, letterSpacing: ".06em",
});

const delta = (up: boolean): object => ({
  display: "inline-flex", alignItems: "center", gap: 3,
  fontFamily: "'DM Mono',monospace", fontSize: 11, fontWeight: 600,
  padding: "2px 6px", borderRadius: 5,
  background: up ? V.okS : V.errS,
  color: up ? V.ok : V.err,
});

/* ── Suggestion chips (pura UI) ─────────────────────────────── */
const CHIPS = [
  { icon: "↘", text: "Producto que más bajó",    q: "¿Qué producto está bajando en ventas este mes?" },
  { icon: "↗", text: "Ticket promedio por sede", q: "Compara el ticket promedio entre sedes este mes" },
  { icon: "👤", text: "Ranking de meseros",       q: "¿Qué empleado cerró más ventas este mes?" },
  { icon: "⏱", text: "Horas pico",               q: "¿Cuáles son las horas pico por sede?" },
  { icon: "✦",  text: "Predicción de ventas",     q: "Predice las ventas del próximo fin de semana" },
  { icon: "⚠", text: "Mermas y margen",           q: "¿Dónde estoy perdiendo margen por mermas?" },
];

/* ── Chat messages ─────────────────────────────────────────── */
type Msg = { role: "ai" | "user"; text: string; tools?: string[] };

/* ── Tipos de data real (alimentados desde /api/dashboard) ─── */
type DashStats = {
  sales:         { value: number; prev: number; delta: number };
  orders:        { value: number; prev: number; delta: number };
  averageTicket: { value: number; prev: number; delta: number };
};
type TopItem = { name: string; quantity: number; total: number };

function fmtMoney(n: number) {
  return "$" + Math.round(n).toLocaleString("es-MX");
}
function deltaStr(pct: number) {
  if (pct === 0) return "—";
  return (pct > 0 ? "↑ " : "↓ ") + Math.abs(pct) + "%";
}
const INIT_MSGS: Msg[] = [
  { role: "ai", text: "Hola, soy Mesero. Puedo consultar ventas, productos top, inventario bajo y personal activo de tu sucursal activa. ¿Qué quieres saber?", tools: [] },
];

/* ════════════════════════════════════════════════════════════ */
export default function ReportesIAPage() {
  const [prompt, setPrompt] = useState("");
  const [chatMsg, setChatMsg] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [period, setPeriod] = useState<"HOY"|"7D"|"30D"|"TRIM"|"AÑO">("30D");

  /* Data real del tenant/sucursal activa */
  const [brand, setBrand]   = useState<{ name: string; locationsCount: number }>({ name: "", locationsCount: 0 });
  const [stats, setStats]   = useState<DashStats | null>(null);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs]);

  // Carga inicial de brand + conteo de sucursales
  useEffect(() => {
    (async () => {
      try {
        const [cfg, locs] = await Promise.all([
          api.get("/api/admin/config").catch(() => ({ data: null })),
          api.get("/api/admin/locations").catch(() => ({ data: [] })),
        ]);
        setBrand({
          name: cfg.data?.name || "",
          locationsCount: Array.isArray(locs.data) ? locs.data.length : 0,
        });
      } catch { /* no-op */ }
    })();
  }, []);

  // KPIs + top productos dependen del período
  useEffect(() => {
    // Dashboard endpoints aceptan HOY|7D|30D|AÑO. TRIM lo mapeamos a 30D.
    const mapped = period === "TRIM" ? "30D" : period;
    (async () => {
      try {
        const { data } = await api.get("/api/dashboard/stats", { params: { period: mapped } });
        setStats(data || null);
      } catch { setStats(null); }
    })();
    (async () => {
      try {
        const { data } = await api.get("/api/dashboard/top-items", { params: { period: mapped, limit: 5 } });
        setTopItems(Array.isArray(data) ? data : []);
      } catch { setTopItems([]); }
    })();
  }, [period]);

  const [sending, setSending] = useState(false);
  // Historial en formato de la API (role "user"|"assistant" + content string|blocks).
  // Lo mantenemos separado de `msgs` (que es solo para la UI) para poder pasar el
  // ida-y-vuelta completo con tool_use/tool_result al backend.
  const apiHistoryRef = useRef<{ role: "user" | "assistant"; content: unknown }[]>([]);

  async function sendChat(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    setSending(true);
    setChatMsg("");
    setMsgs(m => [...m, { role: "user", text: clean }, { role: "ai", text: "Analizando…", tools: ["Consultando datos"] }]);

    try {
      apiHistoryRef.current.push({ role: "user", content: clean });
      const { data } = await api.post("/api/ai/assistant", { messages: apiHistoryRef.current });
      const history = Array.isArray(data?.messages) ? data.messages : [];
      apiHistoryRef.current = history;

      // Última respuesta del asistente: juntar todos los bloques `text`.
      const last = [...history].reverse().find((m: any) => m.role === "assistant");
      let reply = "No recibí una respuesta.";
      const tools: string[] = [];
      if (last && Array.isArray(last.content)) {
        const texts = last.content.filter((b: any) => b.type === "text").map((b: any) => b.text).filter(Boolean);
        if (texts.length) reply = texts.join("\n\n");
      } else if (typeof last?.content === "string") {
        reply = last.content;
      }
      // Herramientas invocadas en toda la cadena (para mostrar el pipeline).
      for (const m of history) {
        if (m.role !== "assistant" || !Array.isArray(m.content)) continue;
        for (const b of m.content) {
          if (b?.type === "tool_use" && b?.name) tools.push(String(b.name));
        }
      }

      setMsgs(m => {
        const next = [...m];
        next[next.length - 1] = { role: "ai", text: reply, tools: tools.length ? tools : undefined };
        return next;
      });
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const needsKey = status === 402 || data?.code === "AI_KEY_REQUIRED";
      const msg = needsKey
        ? `⚠ ${data?.error || "Configura tu API key de Google AI Studio para activar el asistente."} → [Ir a Integraciones](/admin/integraciones)`
        : `⚠ ${data?.error || err?.message || "No pude completar la consulta."}`;
      setMsgs(m => {
        const next = [...m];
        next[next.length - 1] = { role: "ai", text: msg };
        return next;
      });
      // No persistir el turno fallido en el historial de la API.
      apiHistoryRef.current = apiHistoryRef.current.slice(0, -1);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <style>{CSS}</style>
      {/* Break out of the parent p-8 so we can control our own layout */}
      <div style={{ display: "flex", margin: -32, overflow: "hidden" }}>

        {/* ═══ MAIN ═══════════════════════════════════════════ */}
        <div className="ia-scroll" style={{
          flex: 1, padding: "24px 28px 64px", overflowY: "auto",
          height: "100vh", overflowX: "hidden",
        }}>

          {/* Topbar */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", paddingBottom: 20, marginBottom: 20, borderBottom: `1px solid ${V.bd1}`, gap: 20 }}>
            <div>
              <h1 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 30, color: V.txHi, letterSpacing: "-.02em", lineHeight: 1.1 }}>
                Reportes · Asistente IA
              </h1>
              <div style={{ fontSize: 13, color: V.txMut, marginTop: 4, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" as const }}>
                {brand.name || "Tu restaurante"}&nbsp;
                {brand.locationsCount > 0 && (
                  <span style={monoTag()}>{brand.locationsCount} sede{brand.locationsCount === 1 ? "" : "s"}</span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
              {/* Period selector */}
              <div style={{ display: "inline-flex", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, padding: 3 }}>
                {(["HOY","7D","30D","TRIM","AÑO"] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: "6px 12px", borderRadius: 7,
                    fontFamily: "'DM Mono',monospace", fontSize: 11,
                    color: period === p ? V.txHi : V.txMut,
                    cursor: "pointer", border: "none",
                    background: period === p ? V.surf1 : "transparent",
                    boxShadow: period === p ? "0 1px 3px rgba(0,0,0,.3)" : "none",
                    fontWeight: 500, letterSpacing: ".04em",
                  }}>{p}</button>
                ))}
              </div>
              <button style={btn(false, true)}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ verticalAlign: -2, marginRight: 4 }}>
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Exportar PDF
              </button>
            </div>
          </div>

          {/* ── AI Hero ── */}
          <div style={{
            background: `radial-gradient(ellipse at top left,rgba(124,58,237,.18),transparent 50%),radial-gradient(ellipse at bottom right,rgba(59,130,246,.10),transparent 50%),${V.surf1}`,
            border: `1px solid rgba(124,58,237,.25)`, borderRadius: 20, padding: 24, marginBottom: 20,
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                background: "rgba(124,58,237,.2)", color: "#dcd0ff",
                padding: "4px 10px", borderRadius: 999,
                fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 700, letterSpacing: ".12em",
              }}>
                <span className="ia-spark" style={{ width: 6, height: 6, borderRadius: "50%", background: V.iris3, boxShadow: `0 0 8px ${V.iris3}`, display: "inline-block" }} />
                Mesero · Asistente de datos
              </div>
            </div>
            <h2 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 22, color: V.txHi, marginBottom: 6 }}>
              Pregúntale a Mesero lo que quieras saber
            </h2>
            <p style={{ fontSize: 13, color: V.txMid, marginBottom: 18, maxWidth: 720 }}>
              Obtén reportes personalizados en lenguaje natural. Mesero analiza tus ventas, inventario y equipo para darte respuestas claras con gráficos y acciones listas para ejecutar.
            </p>
            {/* Prompt box */}
            <div style={{
              position: "relative", background: V.surf2,
              border: `1.5px solid rgba(124,58,237,.3)`, borderRadius: 14,
              padding: "14px 16px", display: "flex", alignItems: "flex-end", gap: 10,
            }}>
              <textarea
                value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder="Ej: compara las ventas de esta semana vs la anterior por sede, y dime qué productos bajaron más"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  resize: "none", color: V.tx, fontSize: 14, fontFamily: "inherit",
                  lineHeight: 1.5, minHeight: 24, maxHeight: 120,
                }}
              />
              <button onClick={() => { if (prompt.trim()) { sendChat(prompt); setPrompt(""); } }} style={{
                width: 38, height: 38, borderRadius: 10, background: V.iris5,
                border: "none", color: "#fff", display: "grid", placeItems: "center",
                cursor: "pointer", boxShadow: `0 4px 14px ${V.irisG}`,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            {/* Chips */}
            <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, marginTop: 14 }}>
              {CHIPS.map(c => (
                <button key={c.text} onClick={() => setPrompt(c.q)} style={{
                  background: V.surf2, border: `1px solid ${V.bd1}`,
                  padding: "7px 12px", borderRadius: 999, fontSize: 12,
                  color: V.txMid, cursor: "pointer", display: "inline-flex",
                  alignItems: "center", gap: 6, fontFamily: "inherit",
                }}>
                  <span style={{ color: V.iris4 }}>{c.icon}</span> {c.text}
                </button>
              ))}
            </div>
          </div>

          {/* ── Insights (empty state — no hay endpoint de detección automática) ── */}

          {/* ── Report Card ── */}
          <div style={{ ...card(), overflow: "hidden", marginBottom: 16 }}>
            {/* Report head */}
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${V.bd1}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: V.irisS, color: V.iris3, padding: "2px 8px", borderRadius: 5, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".06em" }}>KPIs · {period}</span>
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: V.txHi }}>
                  Snapshot de operación · {brand.name || "tu restaurante"}
                </div>
                <div style={{ fontSize: 12, color: V.txMut, marginTop: 2 }}>
                  Datos en vivo de la sucursal activa. Para reportes avanzados, pregúntale a Mesero en el chat →
                </div>
              </div>
            </div>

            {/* KPI strip — datos reales desde /api/dashboard/stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", borderBottom: `1px solid ${V.bd1}` }}>
              {[
                { label: "Ventas",         value: stats ? fmtMoney(stats.sales.value)         : "—", delta: stats ? deltaStr(stats.sales.delta)         : "—", up: (stats?.sales.delta ?? 0) >= 0,         sub: stats ? `antes ${fmtMoney(stats.sales.prev)}`         : "" },
                { label: "Pedidos",        value: stats ? String(stats.orders.value)           : "—", delta: stats ? deltaStr(stats.orders.delta)        : "—", up: (stats?.orders.delta ?? 0) >= 0,        sub: stats ? `antes ${stats.orders.prev}`                   : "" },
                { label: "Ticket promedio",value: stats ? fmtMoney(stats.averageTicket.value)   : "—", delta: stats ? deltaStr(stats.averageTicket.delta) : "—", up: (stats?.averageTicket.delta ?? 0) >= 0,sub: stats ? `antes ${fmtMoney(stats.averageTicket.prev)}` : "" },
              ].map((k, i) => (
                <div key={k.label} style={{ padding: "16px 22px", borderRight: i < 2 ? `1px solid ${V.bd1}` : "none" }}>
                  <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".14em", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
                  <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: V.txHi, lineHeight: 1, letterSpacing: "-.02em" }}>{k.value}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                    <span style={delta(k.up)}>{k.delta}</span>
                    <span style={{ fontSize: 11, color: V.txMut }}>{k.sub}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Report body */}
            <div style={{ padding: 22 }}>
              {/* Empty-state del resumen ejecutivo: el backend aún no expone
                  resúmenes pregenerados. Mesero (el chat) es el punto de entrada. */}
              <div style={{ background: V.surf2, border: `1px dashed ${V.bd1}`, borderRadius: 12, padding: "20px 18px", marginBottom: 18, textAlign: "center" as const }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 4 }}>
                  Resumen ejecutivo generado por Mesero
                </div>
                <p style={{ fontSize: 12, color: V.txMut, lineHeight: 1.6, margin: 0, maxWidth: 560, marginInline: "auto" as const }}>
                  Pídele a Mesero en el chat (→) algo como “resume mis ventas del mes” o “compara esta semana vs la anterior” y te generará el análisis aquí.
                </p>
              </div>

              {/* Top productos — /api/dashboard/top-items */}
              <div>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                  Top productos · {period}
                </h3>
                <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, padding: "6px 16px" }}>
                  {topItems.length === 0 && (
                    <div style={{ padding: "24px 0", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                      Sin ventas registradas en este período.
                    </div>
                  )}
                  {topItems.map((p, i) => (
                    <div key={`${p.name}-${i}`} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < topItems.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: V.txDim, width: 20 }}>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: V.txMut }}>{p.quantity} uds.</div>
                        </div>
                      </div>
                      <div style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>{fmtMoney(p.total)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* ═══ CHAT PANEL ════════════════════════════════════ */}
        <div style={{
          width: 380, height: "100vh", position: "sticky", top: 0,
          display: "flex", flexDirection: "column",
          borderLeft: `1px solid ${V.bd1}`, background: V.surf3, flexShrink: 0,
        }}>
          {/* Chat header */}
          <div style={{ padding: "16px 18px", borderBottom: `1px solid ${V.bd1}`, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: `linear-gradient(135deg,${V.iris4},${V.iris5})`, display: "grid", placeItems: "center", color: "#fff", position: "relative", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 9l-5 4.87L16.18 22 12 18.27 7.82 22 9 13.87 4 9l5.91-.74z"/></svg>
              <div style={{ position: "absolute", bottom: -2, right: -2, width: 10, height: 10, background: V.ok, borderRadius: "50%", border: `2px solid ${V.surf3}` }} />
            </div>
            <div>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi }}>Mesero</h3>
              <div style={{ fontSize: 10, color: V.ok, fontFamily: "'DM Mono',monospace", letterSpacing: ".08em", textTransform: "uppercase", fontWeight: 600 }}>● En línea · listo</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
              <button onClick={() => setMsgs(INIT_MSGS)} style={{ width: 30, height: 30, borderRadius: 8, background: "transparent", border: "none", color: V.txMut, cursor: "pointer", display: "grid", placeItems: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>

          {/* Chat body */}
          <div ref={chatRef} className="ia-scroll" style={{ flex: 1, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 10, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "ai" && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${V.iris4},${V.iris5})`, display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", fontSize: 11, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>M</div>
                )}
                <div style={{ flex: "1 1 0", minWidth: 0 }}>
                  <div style={{
                    maxWidth: 270, padding: "10px 14px", borderRadius: 14, fontSize: 13, lineHeight: 1.55,
                    ...(m.role === "ai"
                      ? { background: V.surf1, color: V.txMid, border: `1px solid ${V.bd1}`, borderTopLeftRadius: 4 }
                      : { background: V.iris5, color: "#fff", borderTopRightRadius: 4, marginLeft: "auto" }),
                  }}>
                    {m.text}
                  </div>
                  {m.tools && m.tools.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                      {m.tools.map((t, ti) => (
                        <div key={t} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 8, fontSize: 11, color: V.txMid, fontFamily: "'DM Mono',monospace" }}>
                          {i < msgs.length - 1
                            ? <span style={{ width: 10, height: 10, borderRadius: "50%", background: V.ok, display: "inline-block" }} />
                            : (ti === m.tools!.length - 1
                              ? <span className="ia-spin" style={{ width: 10, height: 10, border: `1.5px solid ${V.iris4}`, borderRightColor: "transparent", borderRadius: "50%", display: "inline-block" }} />
                              : <span style={{ width: 10, height: 10, borderRadius: "50%", background: V.ok, display: "inline-block" }} />)
                          }
                          {t}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#10b981,#047857)", display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", fontSize: 11, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>Tú</div>
                )}
              </div>
            ))}
            {/* Typing indicator if last message is user */}
            {msgs[msgs.length - 1]?.role === "user" && (
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: `linear-gradient(135deg,${V.iris4},${V.iris5})`, display: "grid", placeItems: "center", flexShrink: 0, color: "#fff" }}>M</div>
                <div style={{ background: V.surf1, border: `1px solid ${V.bd1}`, borderRadius: 14, borderTopLeftRadius: 4, padding: "10px 14px", display: "flex", gap: 3 }}>
                  {[0,1,2].map(k => <span key={k} className="ia-tp" style={{ width: 6, height: 6, borderRadius: "50%", background: V.iris4, display: "inline-block" }} />)}
                </div>
              </div>
            )}
          </div>

          {/* Chat input */}
          <div style={{ padding: "14px 18px 18px", borderTop: `1px solid ${V.bd1}` }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {["Resumir el reporte","Enviar por email","Predecir próxima semana"].map(c => (
                <button key={c} onClick={() => setChatMsg(c)} style={{ background: V.surf2, border: `1px solid ${V.bd1}`, padding: "5px 10px", borderRadius: 999, fontSize: 11, color: V.txMid, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
              ))}
            </div>
            <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, padding: "10px 10px 10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={chatMsg} onChange={e => setChatMsg(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendChat(chatMsg)}
                placeholder="Escribe o usa /reporte, /alerta, /predicción…"
                style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: V.tx, fontSize: 13, fontFamily: "inherit" }}
              />
              <button onClick={() => sendChat(chatMsg)} style={{ width: 32, height: 32, borderRadius: 8, background: V.iris5, border: "none", color: "#fff", cursor: "pointer", display: "grid", placeItems: "center" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, fontSize: 10, color: V.txDim, fontFamily: "'DM Mono',monospace", letterSpacing: ".04em" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, background: V.ok, borderRadius: "50%", display: "inline-block" }} />
                MESERO · Gemini
              </span>
              <span>Enter para enviar</span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
