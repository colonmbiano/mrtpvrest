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

.ia-main-panel {
  flex: 1; padding: 24px 28px 64px; overflow-y: auto; height: 100vh; overflow-x: hidden;
}
.ia-chat-panel {
  width: 380px; height: 100vh; position: sticky; top: 0;
  display: flex; flex-direction: column;
  border-left: 1px solid var(--border); background: var(--surf3); flex-shrink: 0;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
  z-index: 40;
}
.ia-chat-panel.closed { display: none; }
.ia-fab {
  position: fixed; bottom: 24px; right: 24px; z-index: 30;
  width: 56px; height: 56px; border-radius: 28px;
  background: linear-gradient(135deg, #9472ff, #7c3aed); 
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 14px rgba(124,58,237,.35);
  cursor: pointer; border: none; outline: none;
  transition: transform 0.2s;
}
.ia-fab:hover { transform: scale(1.05); }
.ia-fab:active { transform: scale(0.95); }
.ia-overlay {
  display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 35;
  backdrop-filter: blur(2px);
}

@media (max-width: 900px) {
  .ia-main-panel { padding: 16px !important; }
  .ia-chat-panel {
    position: fixed !important; right: 0; top: 0; bottom: 0;
    width: 100% !important; max-width: 380px;
    transform: translateX(100%); display: flex !important;
  }
  .ia-chat-panel.open { transform: translateX(0); }
  .ia-overlay.open { display: block; }
}

@media print {
  .ia-chat-panel, .ia-overlay, .ia-fab, .ia-no-print { display: none !important; }
  .ia-main-panel { height: auto !important; overflow: visible !important; padding: 0 !important; }
}
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
type SuggestedAction = { n: number; title: string; sub: string; cta: string; prompt: string };
type DailyPoint = { date: string; revenue: number; orders: number };
type SalesByDay = {
  days: number;
  series: DailyPoint[];
  totals: { current: { revenue: number; orders: number }; previous: { revenue: number; orders: number }; delta: number };
};

const PERIOD_LABEL: Record<"HOY"|"7D"|"30D"|"90D"|"AÑO"|"HIST", string> = {
  HOY: "Hoy", "7D": "Últimos 7 días", "30D": "Últimos 30 días", "90D": "Últimos 90 días", "AÑO": "Últimos 365 días", HIST: "Histórico completo",
};
const PERIOD_DAYS: Record<"HOY"|"7D"|"30D"|"90D"|"AÑO"|"HIST", number> = {
  HOY: 1, "7D": 7, "30D": 30, "90D": 90, "AÑO": 90, HIST: 90, // AÑO/HIST se acotan a 90 días para que la gráfica sea legible
};

/* ── Chat messages ─────────────────────────────────────────── */
type Msg = { role: "ai" | "user"; text: string; tools?: string[] };
const INIT_MSGS: Msg[] = [
  { role: "ai", text: "Hola, soy Mesero. Puedo consultar ventas, productos top, inventario bajo y personal activo de tu sucursal activa. ¿Qué quieres saber?", tools: [] },
];

/* ════════════════════════════════════════════════════════════ */
export default function ReportesIAPage() {
  const [prompt, setPrompt] = useState("");
  const [chatMsg, setChatMsg] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [isChatOpen, setIsChatOpen] = useState(false);
  // Períodos alineados con backend (getPeriodRange):
  // - 90D reemplaza al antiguo "TRIM" (trimestre ~ 90 días)
  // - AÑO ahora es rolling 365d (no año en curso)
  // - HIST captura todo el histórico — clave para ver datos importados
  //   antiguos que no caen en los últimos 365 días.
  const [period, setPeriod] = useState<"HOY"|"7D"|"30D"|"90D"|"AÑO"|"HIST">("HIST");
  const chatRef = useRef<HTMLDivElement>(null);

  // Datos reales del dashboard (sin fallbacks mock)
  const [stats, setStats]       = useState<StatsResponse | null>(null);
  const [sedes, setSedes]       = useState<SedeRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [saved, setSaved]       = useState<SavedReport[]>([]);
  const [topItems, setTopItems] = useState<Array<{ id?: string; name: string; quantity: number; revenue: number }>>([]);
  const [actions, setActions]   = useState<SuggestedAction[]>([]);
  const [daily, setDaily]       = useState<SalesByDay | null>(null);
  const [loading, setLoading]   = useState(true);
  // Feedback efímero para acciones (copiar enlace, guardar). Se autodescarta.
  const [toast, setToast]       = useState<string | null>(null);
  // Reportes guardados en el navegador. Backend GET /api/reports/saved es stub
  // que regresa [], así que mientras no exista persistencia real usamos
  // localStorage para que el botón "Guardar" tenga consecuencia visible.
  const [savedLocal, setSavedLocal] = useState<SavedReport[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ia-saved-reports");
      if (raw) setSavedLocal(JSON.parse(raw));
    } catch { /* localStorage no disponible */ }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  function persistSaved(list: SavedReport[]) {
    setSavedLocal(list);
    try { localStorage.setItem("ia-saved-reports", JSON.stringify(list)); } catch { /* noop */ }
  }

  function handleSaveReport() {
    const id = `local-${Date.now()}`;
    const ordersTxt = stats ? `${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos` : "sin pedidos";
    const next: SavedReport = {
      id,
      title: `Ventas por sucursal · ${PERIOD_LABEL[period]}`,
      tag: "LOCAL",
      tagColor: V.iris3 as string,
      tagBg: V.irisS as string,
      sub: `${sedes.length} ${sedes.length === 1 ? "sede" : "sedes"} · ${ordersTxt} · guardado ${new Date().toLocaleDateString("es-MX")}`,
    };
    persistSaved([next, ...savedLocal]);
    setToast("Reporte guardado");
  }

  async function handleShareReport() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?period=${period}` : "";
    try {
      await navigator.clipboard.writeText(url);
      setToast("Enlace copiado al portapapeles");
    } catch {
      setToast("No se pudo copiar el enlace");
    }
  }

  function handleExportPdf() {
    if (typeof window !== "undefined") window.print();
  }

  function handleNewSavedReport() {
    sendChat(`Quiero crear un reporte personalizado nuevo del periodo ${PERIOD_LABEL[period]}. ¿Qué métricas o cortes me sugieres incluir según los datos que ya tienes?`);
    setIsChatOpen(true);
  }

  function handleMoreInsights() {
    sendChat(`Dame más insights y patrones interesantes del periodo ${PERIOD_LABEL[period]} más allá de los que ya detectaste automáticamente.`);
    setIsChatOpen(true);
  }

  function handleDeleteSaved(id: string) {
    persistSaved(savedLocal.filter(s => s.id !== id));
  }

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const safe = <T,>(p: Promise<{ data: T }>, fallback: T): Promise<T> =>
          p.then(r => r.data).catch(() => fallback);

        const [s, loc, ins, sv, items, acts, dly] = await Promise.all([
          safe<StatsResponse>(api.get(`/api/dashboard/stats?period=${period}`), null as any),
          safe<SedeRow[]>(api.get(`/api/dashboard/sales-by-location?period=${period}`), []),
          safe<Insight[]>(api.get(`/api/dashboard/insights?period=${period}`), []),
          safe<SavedReport[]>(api.get(`/api/reports/saved`), []),
          safe<Array<{ id?: string; name: string; quantity: number; revenue: number }>>(
            api.get(`/api/dashboard/top-items?period=${period}&limit=5`), []
          ),
          safe<SuggestedAction[]>(api.get(`/api/dashboard/suggested-actions?period=${period}`), []),
          safe<SalesByDay>(api.get(`/api/dashboard/sales-by-day?days=${PERIOD_DAYS[period]}`), null as any),
        ]);
        if (cancel) return;
        setStats(s);
        setSedes(loc);
        setInsights(ins);
        setSaved(sv);
        setTopItems(items);
        setActions(acts);
        setDaily(dly);
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
      const { data } = await api.post("/api/ai/assistant", { messages: apiHistoryRef.current, period });
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
        ? `⚠ ${data?.error || "Configura tu API key de Groq Cloud para activar el asistente."} → [Ir a Integraciones](/admin/integraciones)`
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
        <div className="ia-scroll ia-main-panel" style={{
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
                {(["HOY","7D","30D","90D","AÑO","HIST"] as const).map(p => (
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
              <button onClick={handleExportPdf} style={btn(false, true)} title="Imprimir o guardar como PDF">
                <span className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95" style={{ verticalAlign: -2, marginRight: 4 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </span>
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
                <div className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </div>
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
              <div style={{ fontSize: 12, color: V.txMut, marginTop: 2 }}>Detectados automáticamente en {PERIOD_LABEL[period].toLowerCase()}</div>
            </div>
            <button onClick={handleMoreInsights} style={btn(false, true)} title="Pedir más insights al asistente">Pedir más →</button>
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
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/></svg>
                    </div>
                    <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: ".14em", textTransform: "uppercase" as const, fontWeight: 700, color: col.kind }}>{ins.kind}</span>
                  </div>
                  <h4 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 15, color: V.txHi, marginBottom: 6, lineHeight: 1.25 }}>{ins.title}</h4>
                  <p style={{ fontSize: 12, color: V.txMid, lineHeight: 1.5, marginBottom: 12 }}>{ins.body}</p>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      onClick={() => {
                        const prompt = `Sobre este insight: "${ins.title}" (${ins.body}). Quiero ${ins.cta}. ¿Qué me sugieres hacer específicamente?`;
                        sendChat(prompt);
                        setIsChatOpen(true);
                      }}
                      style={{ ...btn(true), padding: "6px 10px", fontSize: 11 }}
                    >
                      {ins.cta}
                    </button>
                    <button 
                      onClick={() => setInsights(prev => prev.filter(i => i.title !== ins.title))}
                      style={{ ...btn(false), padding: "6px 10px", fontSize: 11 }}
                    >
                      Ignorar
                    </button>
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
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: V.irisS, color: V.iris3, padding: "2px 8px", borderRadius: 5, fontFamily: "'DM Mono',monospace", fontSize: 10, fontWeight: 600, letterSpacing: ".06em" }}>✨ DATOS EN VIVO</span>
                  <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 10, color: V.txDim, letterSpacing: ".1em" }}>{PERIOD_LABEL[period].toUpperCase()}</span>
                </div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18, color: V.txHi }}>Ventas por sucursal · período {period}</div>
                <div style={{ fontSize: 12, color: V.txMut, marginTop: 2, display: "flex", alignItems: "center", gap: 8 }}>
                  <span>{sedes.length} {sedes.length === 1 ? "sede" : "sedes"}</span>
                  <span style={{ color: V.txDim }}>·</span>
                  <span>{stats ? `${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos` : "sin pedidos"}</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={handleSaveReport} style={{ ...btn(false, true), padding: "8px 10px" }} title="Guardar reporte" aria-label="Guardar reporte">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                </button>
                <button onClick={handleShareReport} style={{ ...btn(false, true), padding: "8px 10px" }} title="Copiar enlace al reporte" aria-label="Compartir">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                  </svg>
                </button>
                <button onClick={handleExportPdf} style={{ ...btn(false, true), padding: "8px 10px" }} title="Descargar / imprimir como PDF" aria-label="Descargar">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                </button>
              </div>
            </div>

            {/* KPI strip — datos reales del período */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", borderBottom: `1px solid ${V.bd1}` }}>
              {(() => {
                const fmt = (raw: number | undefined | null) => {
                  const n = Number(raw ?? 0);
                  return n >= 1_000_000 ? `$${(n/1_000_000).toFixed(2)}` :
                         n >= 1_000     ? `$${(n/1_000).toFixed(1)}`     :
                                          `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
                };
                const sml = (raw: number | undefined | null) => {
                  const n = Number(raw ?? 0);
                  return n >= 1_000_000 ? "M" : n >= 1_000 ? "k" : "";
                };
                const fmtPct = (raw: number | undefined | null) => {
                  const d = Number(raw ?? 0);
                  return `${d >= 0 ? "↑" : "↓"} ${Math.abs(d).toFixed(1)}%`;
                };
                const rows = [
                  { label: "Ventas totales",  value: stats ? fmt(stats.sales.value)                      : "—", sml: stats ? sml(stats.sales.value) : "",  up: (stats?.sales.delta        ?? 0) >= 0, delta: stats ? fmtPct(stats.sales.delta)          : "",  sub: stats ? `vs ${fmt(stats.sales.prev)}`                            : "sin datos" },
                  { label: "Pedidos",         value: stats ? (stats.orders.value ?? 0).toLocaleString("es-MX") : "—", sml: "",                            up: (stats?.orders.delta       ?? 0) >= 0, delta: stats ? fmtPct(stats.orders.delta)         : "",  sub: stats ? `vs ${(stats.orders.prev ?? 0).toLocaleString("es-MX")}` : "sin datos" },
                  { label: "Ticket promedio", value: stats ? `$${stats.averageTicket?.value ?? 0}`       : "—", sml: "",                                 up: (stats?.averageTicket?.delta?? 0) >= 0, delta: stats ? fmtPct(stats.averageTicket?.delta) : "",  sub: stats ? `vs $${stats.averageTicket?.prev ?? 0}`                  : "sin datos" },
                  { label: "Prep. activa",    value: stats ? `${stats.prepMinutes?.value ?? 0}`          : "—", sml: "min",                              up: true,                                  delta: "",                                              sub: stats ? `${stats.prepMinutes?.activeCount ?? 0} activos`         : "sin datos" },
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
                    ? `En el período actual se registraron ${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos y $${(stats.sales.value ?? 0).toLocaleString("es-MX",{maximumFractionDigits:0})} en ventas, con ticket promedio de $${stats.averageTicket?.value ?? 0}. Usa el chat de Mesero para generar un análisis detallado sobre este reporte.`
                    : "Aún no hay datos suficientes para generar un resumen. Pregúntale a Mesero desde el panel derecho cuando quieras un análisis personalizado."
                  }
                </p>
              </div>

              {/* Chart — evolución diaria real (datos de /api/dashboard/sales-by-day) */}
              <div style={{ marginBottom: 24 }}>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 14, color: V.txHi, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 3, height: 14, background: V.iris4, borderRadius: 2, display: "inline-block" }} />
                  Evolución diaria · ventas {daily ? `(últimos ${daily.days} días)` : ""}
                </h3>
                <div style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 12, padding: 16 }}>
                  {(() => {
                    const series = daily?.series ?? [];
                    const hasData = series.some(p => (p.revenue ?? 0) > 0);
                    if (!hasData) {
                      return (
                        <div style={{ padding: "48px 16px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                          {loading ? "Cargando ventas por día…" : "Sin ventas registradas en este periodo"}
                        </div>
                      );
                    }
                    const W = 900, H = 260, PL = 50, PR = 20, PT = 20, PB = 40;
                    const innerW = W - PL - PR, innerH = H - PT - PB;
                    const maxRev = Math.max(...series.map(p => p.revenue || 0), 1);
                    const niceMax = (v: number) => {
                      const exp = Math.pow(10, Math.floor(Math.log10(v)));
                      const m = v / exp;
                      const r = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
                      return r * exp;
                    };
                    const yMax = niceMax(maxRev);
                    const ticks = [0.25, 0.5, 0.75, 1].map(f => f * yMax);
                    const xAt = (i: number) => PL + (series.length === 1 ? innerW / 2 : (i * innerW) / (series.length - 1));
                    const yAt = (v: number) => PT + innerH - (v / yMax) * innerH;
                    const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(i).toFixed(1)},${yAt(p.revenue || 0).toFixed(1)}`).join(" ");
                    const areaPath = `${linePath} L ${xAt(series.length - 1).toFixed(1)},${(PT + innerH).toFixed(1)} L ${xAt(0).toFixed(1)},${(PT + innerH).toFixed(1)} Z`;
                    let peakIdx = 0;
                    series.forEach((p, i) => { if ((p.revenue || 0) > (series[peakIdx]!.revenue || 0)) peakIdx = i; });
                    const peak = series[peakIdx]!;
                    const peakDate = new Date(peak.date);
                    const peakLabel = peakDate.toLocaleDateString("es-MX", { weekday: "short", day: "2-digit", month: "short" }).toUpperCase();
                    const weekendDots = series
                      .map((p, i) => ({ p, i, d: new Date(p.date).getDay() }))
                      .filter(o => (o.d === 0 || o.d === 6) && (o.p.revenue || 0) > 0);
                    const labelStep = Math.max(1, Math.ceil(series.length / 8));
                    const xLabels = series.filter((_, i) => i % labelStep === 0).map((p, k) => {
                      const i = k * labelStep;
                      const d = new Date(p.date);
                      return { label: d.toLocaleDateString("es-MX", { day: "2-digit", month: "short" }).replace(".", ""), xPx: xAt(i) };
                    });
                    const fmtAxis = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}k` : `${Math.round(v)}`;
                    const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("es-MX")}`;
                    return (
                      <>
                        <div style={{ display: "flex", gap: 14, fontSize: 11, color: V.txMid, marginBottom: 8, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 10, height: 10, borderRadius: 2, background: "#9472ff", display: "inline-block" }} /> Ventas del día
                          </div>
                          {weekendDots.length > 0 && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ width: 10, height: 10, borderRadius: "50%", background: V.ok, display: "inline-block" }} /> Fin de semana
                            </div>
                          )}
                        </div>
                        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 220 }}>
                          <defs>
                            <linearGradient id="gIA" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#9472ff" stopOpacity=".3"/>
                              <stop offset="100%" stopColor="#9472ff" stopOpacity="0"/>
                            </linearGradient>
                          </defs>
                          <g stroke="rgba(255,255,255,.05)" strokeWidth="1">
                            {ticks.map(t => <line key={t} x1={PL} y1={yAt(t)} x2={W - PR} y2={yAt(t)}/>)}
                          </g>
                          <g fontFamily="DM Mono" fontSize="10" fill="#6e6e92">
                            {ticks.map(t => (
                              <text key={t} x={PL - 6} y={yAt(t) + 3} textAnchor="end">{fmtAxis(t)}</text>
                            ))}
                          </g>
                          <path d={areaPath} fill="url(#gIA)"/>
                          <path d={linePath} stroke="#9472ff" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          <g fill="#10b981">
                            {weekendDots.map(o => <circle key={o.p.date} cx={xAt(o.i)} cy={yAt(o.p.revenue || 0)} r="3.5"/>)}
                          </g>
                          {(peak.revenue || 0) > 0 && (
                            <g transform={`translate(${Math.min(W - 180, Math.max(PL, xAt(peakIdx) - 80))},${PT - 4})`}>
                              <rect width="170" height="34" rx="7" fill="#15152a" stroke="rgba(124,58,237,.3)"/>
                              <text x="10" y="14" fontFamily="DM Mono" fontSize="9" fill="#9494b8" letterSpacing=".1em">PICO · {peakLabel}</text>
                              <text x="10" y="27" fontFamily="Syne" fontWeight="700" fontSize="11" fill="#fff">{fmtMoney(peak.revenue || 0)} · {peak.orders} pedidos</text>
                            </g>
                          )}
                          <g fontFamily="DM Mono" fontSize="9" fill="#6e6e92" textAnchor="middle">
                            {xLabels.map(l => <text key={l.label + l.xPx} x={l.xPx} y={H - 14}>{l.label}</text>)}
                          </g>
                        </svg>
                      </>
                    );
                  })()}
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
                                  ${(s.sales ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
                                </span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}`, minWidth: 180 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ flex: 1, height: 4, background: V.surf3, borderRadius: 2 }}>
                                    <div style={{ width: `${pct}%`, height: 4, background: up ? V.ok : V.err, borderRadius: 2 }} />
                                  </div>
                                  <span style={delta(up)}>{up ? "↑" : "↓"} {Math.abs(Number(s.delta ?? 0)).toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>{(s.orders ?? 0).toLocaleString("es-MX")}</span>
                              </td>
                              <td style={{ padding: 12, borderBottom: `1px solid ${V.bd1}` }}>
                                <span style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>
                                  ${(s.avgTicket ?? 0).toLocaleString("es-MX")}
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
                            <div style={{ fontSize: 11, color: V.txMut }}>{(p.quantity ?? 0).toLocaleString("es-MX")} unidades</div>
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontFamily: "'DM Mono',monospace", color: V.txHi, fontWeight: 600 }}>
                            ${(p.revenue ?? 0).toLocaleString("es-MX", { maximumFractionDigits: 0 })}
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
                    {actions.length === 0 && (
                      <div style={{ background: V.surf2, border: `1px dashed ${V.bd1}`, borderRadius: 10, padding: "20px 14px", textAlign: "center", color: V.txMut, fontSize: 12 }}>
                        {loading ? "Analizando señales del periodo…" : "Sin acciones automáticas para este periodo. Cuando haya caídas de ventas, productos top o stock bajo, aparecerán aquí."}
                      </div>
                    )}
                    {actions.map(a => (
                      <div key={a.n} style={{ background: V.surf2, border: `1px solid ${V.bd1}`, borderRadius: 10, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
                        <div style={{ width: 22, height: 22, borderRadius: 6, background: V.irisS, color: V.iris3, display: "grid", placeItems: "center", flexShrink: 0, fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 11 }}>{a.n}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: V.tx, fontWeight: 600, marginBottom: 2 }}>{a.title}</div>
                          <div style={{ fontSize: 11, color: V.txMut, lineHeight: 1.5 }}>{a.sub}</div>
                          <button
                            onClick={() => { sendChat(a.prompt); setIsChatOpen(true); }}
                            style={{ ...btn(true), marginTop: 8, padding: "5px 10px", fontSize: 11 }}
                          >
                            {a.cta}
                          </button>
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
            <button onClick={handleNewSavedReport} style={btn(false, true)} title="Pedir al asistente que defina uno nuevo">+ Nuevo reporte</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
            {(() => {
              const all = [...savedLocal, ...saved];
              if (all.length === 0) {
                return (
                  <div style={{ gridColumn: "1 / -1", border: `1px dashed ${V.bd1}`, borderRadius: 12, padding: "28px 20px", textAlign: "center", color: V.txMut, fontSize: 13 }}>
                    Aún no has guardado reportes. Usa el botón 💾 del reporte para guardar uno.
                  </div>
                );
              }
              return all.map(s => {
                const isLocal = String(s.id ?? "").startsWith("local-");
                return (
                  <div key={s.id ?? s.title} style={{
                    background: s.active ? `linear-gradient(90deg,rgba(124,58,237,.08),transparent)` : V.surf1,
                    border: `1px solid ${s.active ? V.iris5 : V.bd1}`,
                    borderRadius: 12, padding: "14px 16px",
                    position: "relative",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4, gap: 8 }}>
                      <span style={{ fontWeight: 600, color: V.tx, fontSize: 13 }}>{s.title}</span>
                      <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 9, letterSpacing: ".1em", color: s.tagColor, background: s.tagBg, padding: "2px 6px", borderRadius: 5, fontWeight: 600 }}>{s.tag}</span>
                    </div>
                    <div style={{ fontSize: 11, color: V.txMut }}>{s.sub}</div>
                    {isLocal && (
                      <button
                        onClick={() => handleDeleteSaved(String(s.id))}
                        style={{ position: "absolute", top: 8, right: 8, background: "transparent", border: "none", color: V.txDim, cursor: "pointer", padding: 4, lineHeight: 1, fontSize: 14 }}
                        title="Eliminar reporte guardado"
                        aria-label="Eliminar"
                      >×</button>
                    )}
                  </div>
                );
              });
            })()}
          </div>

        </div>

        {/* ═══ OVERLAY (Mobile only) ═════════════════════════ */}
        <div className={`ia-overlay ${isChatOpen ? "open" : ""}`} onClick={() => setIsChatOpen(false)} />

        {/* ═══ CHAT PANEL ════════════════════════════════════ */}
        <div className={`ia-chat-panel ${isChatOpen ? "open" : "closed"}`} style={{
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
              <button onClick={() => setMsgs(INIT_MSGS)} style={{ width: 30, height: 30, borderRadius: 8, background: "transparent", border: "none", color: V.txMut, cursor: "pointer", display: "grid", placeItems: "center" }} title="Limpiar chat">
                <div className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
              </button>
              <button onClick={() => setIsChatOpen(false)} style={{ width: 30, height: 30, borderRadius: 8, background: "transparent", border: "none", color: V.txHi, cursor: "pointer", display: "grid", placeItems: "center" }} title="Ocultar chat">
                <div className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </div>
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
                <div className="inline-flex transition-transform duration-200 hover:scale-110 active:scale-95">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </div>
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

      {/* ═══ FAB BUTTON ════════════════════════════════════ */}
      {!isChatOpen && (
        <button className="ia-fab" onClick={() => setIsChatOpen(true)} title="Abrir asistente IA">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
        </button>
      )}

      {/* ═══ TOAST (feedback de copiar/guardar) ════════════ */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed", bottom: 96, left: "50%", transform: "translateX(-50%)",
            background: V.surf1, border: `1px solid ${V.bd1}`, color: V.txHi,
            padding: "10px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600,
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)", zIndex: 60,
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
