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

/* ── Suggestion chips ──────────────────────────────────────── */
const CHIPS = [
  { icon: "↘", text: "Producto que más bajó",    q: "¿Qué producto está bajando en ventas este mes?" },
  { icon: "↗", text: "Ticket promedio por sede", q: "Compara el ticket promedio entre sedes este mes" },
  { icon: "👤", text: "Ranking de meseros",       q: "¿Qué empleado cerró más ventas este mes?" },
  { icon: "⏱", text: "Horas pico",               q: "¿Cuáles son las horas pico por sede?" },
  { icon: "✦",  text: "Predicción de ventas",     q: "Predice las ventas del próximo fin de semana" },
  { icon: "⚠", text: "Mermas y margen",           q: "¿Dónde estoy perdiendo margen por mermas?" },
];

/* ── Insight card color tokens (styling, not data) ────────────── */
const INSIGHT_COLORS = {
  warn: { border: "rgba(245,158,11,.25)", bg: "rgba(245,158,11,.06)", icon: V.warn, iconBg: V.warnS, kind: V.warn },
  ok:   { border: "rgba(16,185,129,.25)", bg: "rgba(16,185,129,.06)", icon: V.ok,   iconBg: V.okS,   kind: V.ok   },
  info: { border: "rgba(124,58,237,.25)", bg: "rgba(124,58,237,.06)", icon: V.iris3, iconBg: V.irisS, kind: V.iris3 },
} as const;

type Insight = {
  kind: string;
  variant: keyof typeof INSIGHT_COLORS;
  title: string;
  body: string;
  cta: string;
};

type StatsResponse = {
  sales:         { value: number; prev: number; delta: number };
  orders:        { value: number; prev: number; delta: number };
  averageTicket: { value: number; prev: number; delta: number };
  prepMinutes:   { value: number; activeCount: number };
};
type SedeRow = { id: string; name: string; slug: string; sales: number; orders: number; avgTicket: number; delta: number };
type SavedReport = { id: string; title: string; tag: string; tagColor: string; tagBg: string; sub: string; active?: boolean };

/* ── Chat messages ─────────────────────────────────────────── */
type Msg = { role: "ai" | "user"; text: string; chart?: boolean; tools?: string[] };
const INIT_MSGS: Msg[] = [
  { role: "ai", text: "Hola, soy Mesero. Puedo consultar ventas, productos top, inventario bajo y personal activo de tu sucursal activa. ¿Qué quieres saber?", tools: [] },
];

/* ════════════════════════════════════════════════════════════ */
export default function ReportesIAPage() {
  const [prompt, setPrompt] = useState("");
  const [chatMsg, setChatMsg] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [period, setPeriod] = useState<"HOY"|"7D"|"30D"|"TRIM"|"AÑO">("30D");
  const chatRef = useRef<HTMLDivElement>(null);

  // Datos reales del dashboard (sin fallbacks mock)
  const [stats, setStats]       = useState<StatsResponse | null>(null);
  const [sedes, setSedes]       = useState<SedeRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [saved, setSaved]       = useState<SavedReport[]>([]);
  const [topItems, setTopItems] = useState<Array<{ id: string; name: string; quantity: number; revenue: number }>>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const safe = <T,>(p: Promise<{ data: T }>, fallback: T): Promise<T> =>
          p.then(r => r.data).catch(() => fallback);

        const [s, loc, ins, sv, items] = await Promise.all([
          safe<StatsResponse>(api.get(`/api/dashboard/stats?period=${period}`), null as any),
          safe<SedeRow[]>(api.get(`/api/dashboard/sales-by-location?period=${period}`), []),
          safe<Insight[]>(api.get(`/api/dashboard/insights?period=${period}`), []),
          safe<SavedReport[]>(api.get(`/api/reports/saved`), []),
          safe<Array<{ id: string; name: string; quantity: number; revenue: number }>>(
            api.get(`/api/dashboard/top-items?period=${period}&limit=5`), []
          ),
        ]);
        if (cancel) return;
        setStats(s);
        setSedes(loc);
        setInsights(ins);
        setSaved(sv);
        setTopItems(items);
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    load();
    return () => { cancel = true; };
  }, [period]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [msgs]);

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
                <span style={monoTag()}>{sedes.length} {sedes.length === 1 ? "sede" : "sedes"}</span>
                <span style={{ color: V.txDim }}>·</span>
                <span>Período <span style={{ fontFamily: "'DM Mono',monospace", color: V.txMid }}>{period}</span></span>
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

          {/* ── Insights ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: V.txHi }}>Insights que encontré para ti</h3>
              <div style={{ fontSize: 12, color: V.txMut, marginTop: 2 }}>Detectados automáticamente en los últimos 30 días</div>
            </div>
            <button style={btn(false, true)}>Ver todos →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: insights.length === 0 ? "1fr" : "repeat(3,1fr)", gap: 12, marginBottom: 20 }}>
            {insights.length === 0 && (
              <div style={{ ...card(), padding: "32px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                {loading ? "Analizando datos del período…" : "Aún no hay insights automáticos para este período."}
              </div>
            )}
            {insights.map(ins => {
              const col = INSIGHT_COLORS[ins.variant] ?? INSIGHT_COLORS.info;
              return (
                <div key={ins.title} style={{
                  ...card(),
                  borderColor: col.border,
                  background: `linear-gradient(180deg,${col.bg},transparent 60%),${V.surf1}`,
                  padding: 16,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: col.iconBg, color: col.icon, display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>
                    </div>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 700, color: col.kind }}>{ins.kind}</span>
                  </div>
                  <h4 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 6, lineHeight: 1.25 }}>{ins.title}</h4>
                  <p style={{ fontSize: 12, color: V.txMid, lineHeight: 1.5, marginBottom: 12 }}>{ins.body}</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button style={{ ...btn(true), padding: "6px 10px", fontSize: 11 }}>{ins.cta}</button>
                    <button style={{ ...btn(false), padding: "6px 10px", fontSize: 11 }}>Ignorar</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Report Card ── */}
          <div style={{ ...card(), overflow: "hidden", marginBottom: 16 }}>
            {/* Report head */}
            <div style={{ padding: "18px 22px", borderBottom: `1px solid ${V.bd1}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: V.irisS, color: V.iris3, padding: "2px 8px", borderRadius: 5, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".06em" }}>✨ GENERADO POR MESERO</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>HACE 2 MIN · 30 DÍAS</span>
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: V.txHi }}>Ventas por sucursal · período {period}</div>
                <div style={{ fontSize: 12, color: V.txMut, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{sedes.length} {sedes.length === 1 ? "sede" : "sedes"}</span>
                  <span style={{ color: V.txDim }}>·</span>
                  <span>{stats ? `${stats.orders.value.toLocaleString("es-MX")} pedidos` : "sin pedidos"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {["💾","↗","⬇"].map(ic => (
                  <button key={ic} style={{ ...btn(false, true), padding: "8px 10px" }}>{ic}</button>
                ))}
              </div>
            </div>

            {/* KPI strip — datos reales del período */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${V.bd1}` }}>
              {(() => {
                const fmt = (n: number) =>
                  n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}` :
                  n >= 1_000     ? `$${(n/1_000).toFixed(1)}`     :
                                   `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
                const sml = (n: number) => n >= 1_000_000 ? "M" : n >= 1_000 ? "k" : "";
                const fmtPct = (d: number) => `${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}%`;
                const rows = [
                  { label: "Ventas totales",  value: stats ? fmt(stats.sales.value)             : "—", sml: stats ? sml(stats.sales.value) : "",  up: (stats?.sales.delta        ?? 0) >= 0, delta: stats ? fmtPct(stats.sales.delta)          : "",  sub: stats ? `vs ${fmt(stats.sales.prev)}`           : "sin datos" },
                  { label: "Pedidos",         value: stats ? stats.orders.value.toLocaleString("es-MX") : "—", sml: "",                            up: (stats?.orders.delta       ?? 0) >= 0, delta: stats ? fmtPct(stats.orders.delta)         : "",  sub: stats ? `vs ${stats.orders.prev.toLocaleString("es-MX")}` : "sin datos" },
                  { label: "Ticket promedio", value: stats ? `$${stats.averageTicket.value}` : "—",       sml: "",                                 up: (stats?.averageTicket.delta?? 0) >= 0, delta: stats ? fmtPct(stats.averageTicket.delta) : "",  sub: stats ? `vs $${stats.averageTicket.prev}`       : "sin datos" },
                  { label: "Prep. activa",    value: stats ? `${stats.prepMinutes.value}` : "—",          sml: "min",                              up: true,                                  delta: "",                                              sub: stats ? `${stats.prepMinutes.activeCount} activos` : "sin datos" },
                ];
                return rows.map((k, i) => (
                  <div key={k.label} style={{ padding: "16px 22px", borderRight: i < 3 ? `1px solid ${V.bd1}` : "none" }}>
                    <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".14em", textTransform: "uppercase" as const, marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: V.txHi, lineHeight: 1, letterSpacing: "-.02em" }}>
                      {k.value}<span style={{ fontSize: 13, color: V.txMut, fontWeight: 600 }}>{k.sml}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                      {k.delta ? <span style={delta(k.up)}>{k.delta}</span> : <span />}
                      <span style={{ fontSize: 11, color: V.txMut }}>{k.sub}</span>
                    </div>
                  </div>
                ));
              })()}
            </div>

            {/* Report body */}
            <div style={{ padding: 22 }}>
              {/* AI Summary — se genera bajo demanda desde el chat de Mesero */}
              <div style={{ background: `linear-gradient(180deg,rgba(124,58,237,.05),transparent),${V.surf2}`, border: `1px solid rgba(124,58,237,.2)`, borderRadius: 12, padding: "16px 18px", marginBottom: 18 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: "rgba(124,58,237,.25)", color: "#dcd0ff", display: "grid", placeItems: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.09 6.26L20 9l-5 4.87L16.18 22 12 18.27 7.82 22 9 13.87 4 9l5.91-.74z"/></svg>
                  </div>
                  <h5 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 13, color: V.txHi }}>Resumen ejecutivo · Mesero</h5>
                </div>
                <p style={{ fontSize: 13, color: V.txMid, lineHeight: 1.6 }}>
                  {stats
                    ? `En el período actual se registraron ${stats.orders.value.toLocaleString("es-MX")} pedidos y $${stats.sales.value.toLocaleString("es-MX",{maximumFractionDigits:0})} en ventas, con ticket promedio de $${stats.averageTicket.value}. Usa el chat de Mesero para generar un análisis detallado sobre este reporte.`
                    : "Aún no hay datos suficientes para generar un resumen. Pregúntale a Mesero desde el panel derecho cuando quieras un análisis personalizado."
                  }
                </p>
              </div>

              {/* Chart */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                  Evolución diaria · ventas vs mes anterior
                </h3>
                <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", gap: 14, fontSize: 11, color: V.txMid, marginBottom: 8 }}>
                    {[{ color: "#9472ff", label: "Este mes" }, { color: V.txDim, label: "Mes anterior" }, { color: V.ok, label: "Fin de semana", round: true }].map(l => (
                      <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 10, height: 10, borderRadius: l.round ? "50%" : 2, background: l.color, display: "inline-block" }} />
                        {l.label}
                      </div>
                    ))}
                  </div>
                  <svg viewBox="0 0 900 260" preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
                    <defs>
                      <linearGradient id="gIA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#9472ff" stopOpacity=".3"/>
                        <stop offset="100%" stopColor="#9472ff" stopOpacity="0"/>
                      </linearGradient>
                    </defs>
                    <g stroke="rgba(255,255,255,.05)" strokeWidth="1">
                      {[30,90,150,210].map(y => <line key={y} x1="50" y1={y} x2="880" y2={y}/>)}
                    </g>
                    <g fontFamily="DM Mono" fontSize="10" fill="#6e6e92">
                      {[["100k",34],["75k",94],["50k",154],["25k",214]].map(([v,y]) => (
                        <text key={v} x="44" y={y} textAnchor="end">{v}</text>
                      ))}
                    </g>
                    <path d="M 60,170 L 90,160 L 120,180 L 150,155 L 180,140 L 210,120 L 240,100 L 270,145 L 300,155 L 330,170 L 360,150 L 390,140 L 420,125 L 450,105 L 480,90 L 510,135 L 540,150 L 570,165 L 600,145 L 630,135 L 660,120 L 690,100 L 720,85 L 750,130 L 780,140 L 810,155 L 840,135 L 870,125"
                      stroke="#6e6e92" strokeWidth="1.5" strokeDasharray="3 3" fill="none"/>
                    <path d="M 60,160 L 90,145 L 120,168 L 150,140 L 180,120 L 210,95 L 240,75 L 270,130 L 300,140 L 330,152 L 360,130 L 390,115 L 420,100 L 450,80 L 480,60 L 510,115 L 540,130 L 570,148 L 600,128 L 630,115 L 660,95 L 690,75 L 720,58 L 750,110 L 780,118 L 810,135 L 840,110 L 870,95 L 870,220 L 60,220 Z"
                      fill="url(#gIA)"/>
                    <path d="M 60,160 L 90,145 L 120,168 L 150,140 L 180,120 L 210,95 L 240,75 L 270,130 L 300,140 L 330,152 L 360,130 L 390,115 L 420,100 L 450,80 L 480,60 L 510,115 L 540,130 L 570,148 L 600,128 L 630,115 L 660,95 L 690,75 L 720,58 L 750,110 L 780,118 L 810,135 L 840,110 L 870,95"
                      stroke="#9472ff" strokeWidth="2" fill="none" strokeLinecap="round"/>
                    <g fill="#10b981">
                      {[[210,95],[240,75],[450,80],[480,60],[690,75],[720,58]].map(([cx,cy]) => (
                        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3.5"/>
                      ))}
                    </g>
                    <g transform="translate(680,20)">
                      <rect width="160" height="34" rx="7" fill="#15152a" stroke="rgba(124,58,237,.3)"/>
                      <text x="10" y="14" fontFamily="DM Mono" fontSize="9" fill="#9494b8" letterSpacing=".1em">PICO · SÁB 11 ABR</text>
                      <text x="10" y="27" fontFamily="Syne" fontWeight="700" fontSize="11" fill="#fff">$94,200 · 168 pedidos</text>
                    </g>
                    <g fontFamily="DM Mono" fontSize="9" fill="#6e6e92" textAnchor="middle">
                      {[["L 18",75],["J 21",180],["D 24",285],["M 27",390],["V 30",495],["L 03",600],["J 06",705],["D 09",810]].map(([label,x]) => (
                        <text key={label} x={x} y="246">{label}</text>
                      ))}
                    </g>
                  </svg>
                </div>
              </div>

              {/* Table */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                  Desempeño por sede
                </h3>
                <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        {["Sede","Ventas","vs Mes ant.","Pedidos","Ticket prom.","Margen",""].map(h => (
                          <th key={h} style={{ textAlign: "left", fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".12em", textTransform: "uppercase", padding: "10px 12px", borderBottom: `1px solid ${V.bd1}`, fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sedes.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: 32, textAlign: "center", color: V.txMut, fontSize: 13 }}>
                            {loading ? "Cargando ventas por sucursal…" : "Sin pedidos en este período"}
                          </td>
                        </tr>
                      )}
                      {(() => {
                        const maxSales = Math.max(1, ...sedes.map(s => s.sales));
                        return sedes.map(s => {
                          const up    = s.delta >= 0;
                          const alert = s.delta <= -10;
                          const pct   = Math.min(100, Math.round((s.sales / maxSales) * 100));
                          return (
                            <tr key={s.id} style={{ background: alert ? "rgba(239,68,68,.04)" : "transparent" }}>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}`, color: V.txMid }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: alert ? V.warn : up ? V.ok : V.iris4, flexShrink: 0 }} />
                                  <span style={{ color: V.txHi, fontWeight: 600 }}>{s.name}</span>
                                  {alert && <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, background: V.warnS, color: V.warn, padding: "2px 6px", borderRadius: 4, letterSpacing: ".08em" }}>ATENCIÓN</span>}
                                </div>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>
                                  ${s.sales.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                                </span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}`, minWidth: 180 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flex: 1, height: 4, background: V.surf3, borderRadius: 2 }}>
                                    <div style={{ width: `${pct}%`, height: 4, background: up ? V.ok : V.err, borderRadius: 2 }} />
                                  </div>
                                  <span style={delta(up)}>{up ? "↑" : "↓"} {Math.abs(s.delta).toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>{s.orders.toLocaleString("es-MX")}</span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>
                                  ${s.avgTicket.toLocaleString("es-MX")}
                                </span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txMut, fontWeight: 600 }}>—</span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}`, textAlign: "right", color: V.txMut }}>→</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom 2-col */}
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
                {/* Top productos */}
                <div>
                  <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                    Top productos del período
                  </h3>
                  <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, padding: "6px 16px" }}>
                    {topItems.length === 0 && (
                      <div style={{ padding: "28px 0", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                        {loading ? "Cargando top productos…" : "Sin pedidos suficientes para el ranking"}
                      </div>
                    )}
                    {topItems.map((p, i) => (
                      <div key={p.id ?? p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < topItems.length - 1 ? `1px solid ${V.bd1}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: V.txDim, width: 20 }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <div style={{ color: V.tx, fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                            <div style={{ fontSize: 11, color: V.txMut }}>{p.quantity.toLocaleString("es-MX")} unidades</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>
                            ${p.revenue.toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Acciones sugeridas */}
                <div>
                  <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                    Acciones sugeridas
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { n: 1, title: "Renegociar proveedor de res",    sub: "Recuperar ~0.8pp de margen (~$17k/mes)", cta: "Agendar reunión" },
                      { n: 2, title: "Replicar menú degustación",       sub: "En 3 sedes sin este producto (potencial +$42k/mes)", cta: "Clonar al menú" },
                      { n: 3, title: "Coaching · encargado Coyoacán",  sub: "Ticket promedio 13% bajo el objetivo", cta: "Crear plan de acción" },
                    ].map(a => (
                      <div key={a.n} style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: V.irisS, color: V.iris3, display: "grid", placeItems: "center", flexShrink: 0, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11 }}>{a.n}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: V.tx, fontWeight: 600, marginBottom: 2 }}>{a.title}</div>
                          <div style={{ fontSize: 11, color: V.txMut, lineHeight: 1.5 }}>{a.sub}</div>
                          <button style={{ ...btn(true), marginTop: 8, padding: "5px 10px", fontSize: 11 }}>{a.cta}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Saved reports ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 12px" }}>
            <div>
              <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 16, color: V.txHi }}>Reportes guardados</h3>
              <div style={{ fontSize: 12, color: V.txMut, marginTop: 2 }}>Reportes recurrentes y favoritos</div>
            </div>
            <button style={btn(false, true)}>+ Nuevo reporte</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            {saved.length === 0 && (
              <div style={{ gridColumn: "1 / -1", border: `1px dashed ${V.bd1}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                Aún no has guardado reportes. Usa “+ Nuevo reporte” para crear el primero.
              </div>
            )}
            {saved.map(s => (
              <div key={s.id ?? s.title} style={{
                background: s.active ? `linear-gradient(90deg,rgba(124,58,237,.08),transparent)` : V.surf1,
                border: `1px solid ${s.active ? V.iris5 : V.bd1}`,
                borderRadius: 12, padding: "14px 16px", cursor: "pointer",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: V.tx, fontSize: 13 }}>{s.title}</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: ".1em", color: s.tagColor, background: s.tagBg, padding: "2px 6px", borderRadius: 5, fontWeight: 600 }}>{s.tag}</span>
                </div>
                <div style={{ fontSize: 11, color: V.txMut }}>{s.sub}</div>
              </div>
            ))}
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
                    {m.chart && (
                      <div style={{ marginTop: 10, background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, padding: 10 }}>
                        <div style={{ fontSize: 11, color: V.txMut, marginBottom: 6, fontFamily: "'DM Mono',monospace", letterSpacing: ".06em", textTransform: "uppercase" }}>Δ vs mes anterior</div>
                        <svg viewBox="0 0 220 80" style={{ width: "100%", height: 72 }}>
                          <g fontFamily="DM Mono" fontSize="7" fill="#9494b8">
                            {[["Polanco",13],["Sta Fe",26],["Reforma",39],["Condesa",52],["Coyoacán",65],["Del Valle",78]].map(([n,y]) => (
                              <text key={n as string} x="0" y={y}>{n}</text>
                            ))}
                          </g>
                          <rect x="52" y="7"  width="120" height="8" fill="#10b981" rx="2"/>
                          <rect x="52" y="20" width="88"  height="8" fill="#10b981" rx="2"/>
                          <rect x="52" y="33" width="60"  height="8" fill="#9472ff" rx="2"/>
                          <rect x="52" y="46" width="46"  height="8" fill="#9472ff" rx="2"/>
                          <rect x="24" y="59" width="28"  height="8" fill="#ef4444" rx="2"/>
                          <rect x="12" y="72" width="40"  height="8" fill="#ef4444" rx="2"/>
                          <line x1="52" y1="0" x2="52" y2="80" stroke="rgba(255,255,255,.1)"/>
                          <g fontFamily="DM Mono" fontSize="7" fill="#fff" fontWeight="700">
                            <text x="175" y="13">+28%</text><text x="143" y="26">+21%</text>
                            <text x="115" y="39">+14%</text><text x="101" y="52">+11%</text>
                            <text x="18"  y="65" textAnchor="end">−6%</text>
                            <text x="6"   y="78" textAnchor="end">−9%</text>
                          </g>
                        </svg>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                          <button style={{ background: V.irisS, border: `1px solid rgba(124,58,237,.3)`, color: "#dcd0ff", padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Abrir reporte</button>
                          <button style={{ background: V.surf3, border: `1px solid ${V.bd1}`, color: V.txMid, padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Guardar</button>
                          <button style={{ background: V.surf3, border: `1px solid ${V.bd1}`, color: V.txMid, padding: "4px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>Email</button>
                        </div>
                      </div>
                    )}
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
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#10b981,#047857)", display: "grid", placeItems: "center", flexShrink: 0, color: "#fff", fontSize: 11, fontFamily: "'Syne',sans-serif", fontWeight: 700 }}>D</div>
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
                MESERO · modelo v2.1
              </span>
              <span>Enter para enviar</span>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
