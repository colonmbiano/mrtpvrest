"use client";
import { useEffect, useRef, useState } from "react";
import { Download } from "lucide-react";
import api from "@/lib/api";
import { Button, PageHeader, PageShell, PageTabs, Segmented, useToast } from "@/components/ds";
import { AiHero } from "./_components/AiHero";
import { InsightsGrid } from "./_components/InsightsGrid";
import { ReportCard } from "./_components/ReportCard";
import { SavedReports } from "./_components/SavedReports";
import { ChatPanel } from "./_components/ChatPanel";
import {
  INIT_MSGS,
  PERIOD_DAYS,
  PERIOD_LABEL,
  PERIODS,
  type Insight,
  type Msg,
  type Period,
  type SalesByDay,
  type SavedReport,
  type SedeRow,
  type StatsResponse,
  type SuggestedAction,
  type TopItem,
} from "./_components/types";

/* Dashboard unificado "Reportes IA": KPIs + gráficas + insights del período,
   con el asistente Mesero (POST /api/ai/assistant) en un panel lateral.
   El FloatingVoiceAgent global se oculta en esta ruta desde el layout. */
export default function ReportesIAPage() {
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>(INIT_MSGS);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("HIST");

  // Datos reales del dashboard (sin fallbacks mock)
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [sedes, setSedes] = useState<SedeRow[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [saved, setSaved] = useState<SavedReport[]>([]);
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [actions, setActions] = useState<SuggestedAction[]>([]);
  const [daily, setDaily] = useState<SalesByDay | null>(null);
  const [loading, setLoading] = useState(true);
  // Reportes guardados en el navegador. Backend GET /api/reports/saved es stub
  // que regresa [], así que mientras no exista persistencia real usamos
  // localStorage para que el botón "Guardar" tenga consecuencia visible.
  const [savedLocal, setSavedLocal] = useState<SavedReport[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("ia-saved-reports");
      if (raw) setSavedLocal(JSON.parse(raw));
    } catch {
      /* localStorage no disponible */
    }
  }, []);

  function persistSaved(list: SavedReport[]) {
    setSavedLocal(list);
    try {
      localStorage.setItem("ia-saved-reports", JSON.stringify(list));
    } catch {
      /* noop */
    }
  }

  function handleSaveReport() {
    const id = `local-${Date.now()}`;
    const ordersTxt = stats ? `${(stats.orders.value ?? 0).toLocaleString("es-MX")} pedidos` : "sin pedidos";
    const next: SavedReport = {
      id,
      title: `Ventas por sucursal · ${PERIOD_LABEL[period]}`,
      tag: "LOCAL",
      tagColor: "var(--brand-primary)",
      tagBg: "var(--accent-soft)",
      sub: `${sedes.length} ${sedes.length === 1 ? "sede" : "sedes"} · ${ordersTxt} · guardado ${new Date().toLocaleDateString("es-MX")}`,
    };
    persistSaved([next, ...savedLocal]);
    toast.success("Reporte guardado");
  }

  async function handleShareReport() {
    const url = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?period=${period}` : "";
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  }

  function handleExportPdf() {
    if (typeof window !== "undefined") window.print();
  }

  function handleNewSavedReport() {
    sendChat(
      `Quiero crear un reporte personalizado nuevo del periodo ${PERIOD_LABEL[period]}. ¿Qué métricas o cortes me sugieres incluir según los datos que ya tienes?`
    );
    setIsChatOpen(true);
  }

  function handleMoreInsights() {
    sendChat(
      `Dame más insights y patrones interesantes del periodo ${PERIOD_LABEL[period]} más allá de los que ya detectaste automáticamente.`
    );
    setIsChatOpen(true);
  }

  function handleDeleteSaved(id: string) {
    persistSaved(savedLocal.filter((s) => s.id !== id));
  }

  function handleInsightAction(ins: Insight) {
    const p = `Sobre este insight: "${ins.title}" (${ins.body}). Quiero ${ins.cta}. ¿Qué me sugieres hacer específicamente?`;
    sendChat(p);
    setIsChatOpen(true);
  }

  function handleSuggestedAction(prompt: string) {
    sendChat(prompt);
    setIsChatOpen(true);
  }

  useEffect(() => {
    let cancel = false;
    async function load() {
      setLoading(true);
      try {
        const safe = <T,>(p: Promise<{ data: T }>, fallback: T): Promise<T> => p.then((r) => r.data).catch(() => fallback);

        const [s, loc, ins, sv, items, acts, dly] = await Promise.all([
          safe<StatsResponse>(api.get(`/api/dashboard/stats?period=${period}`), null as unknown as StatsResponse),
          safe<SedeRow[]>(api.get(`/api/dashboard/sales-by-location?period=${period}`), []),
          safe<Insight[]>(api.get(`/api/dashboard/insights?period=${period}`), []),
          safe<SavedReport[]>(api.get(`/api/reports/saved`), []),
          safe<TopItem[]>(api.get(`/api/dashboard/top-items?period=${period}&limit=5`), []),
          safe<SuggestedAction[]>(api.get(`/api/dashboard/suggested-actions?period=${period}`), []),
          safe<SalesByDay>(api.get(`/api/dashboard/sales-by-day?days=${PERIOD_DAYS[period]}`), null as unknown as SalesByDay),
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
    return () => {
      cancel = true;
    };
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
    setMsgs((m) => [...m, { role: "user", text: clean }, { role: "ai", text: "Analizando…", tools: ["Consultando datos"] }]);

    try {
      apiHistoryRef.current.push({ role: "user", content: clean });
      const { data } = await api.post("/api/ai/assistant", { messages: apiHistoryRef.current, period });
      const history = Array.isArray(data?.messages) ? data.messages : [];
      apiHistoryRef.current = history;

      // Última respuesta del asistente: juntar todos los bloques `text`.
      const last = [...history].reverse().find((m: { role: string }) => m.role === "assistant");
      let reply = "No recibí una respuesta.";
      const tools: string[] = [];
      if (last && Array.isArray(last.content)) {
        const texts = last.content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .filter(Boolean);
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

      setMsgs((m) => {
        const next = [...m];
        next[next.length - 1] = { role: "ai", text: reply, tools: tools.length ? tools : undefined };
        return next;
      });
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string; code?: string } }; message?: string };
      const status = e?.response?.status;
      const data = e?.response?.data;
      const needsKey = status === 402 || data?.code === "AI_KEY_REQUIRED";
      const msg = needsKey
        ? `⚠ ${data?.error || "Configura tu API key de Groq Cloud para activar el asistente."} → [Ir a Integraciones](/admin/integraciones)`
        : `⚠ ${data?.error || e?.message || "No pude completar la consulta."}`;
      setMsgs((m) => {
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
      <PageShell>
        <PageHeader
          eyebrow="Inteligencia de negocio"
          title="Reportes IA"
          subtitle={`${sedes.length} ${sedes.length === 1 ? "sede" : "sedes"} · ${PERIOD_LABEL[period]}`}
        />
        <PageTabs set="reportes" />

        {/* Filtro de período + exportar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Segmented options={PERIODS} value={period} onChange={setPeriod} className="w-full sm:w-auto" />
          <Button variant="secondary" size="sm" icon={Download} onClick={handleExportPdf}>
            Exportar PDF
          </Button>
        </div>

        <AiHero onAsk={sendChat} />

        <InsightsGrid
          insights={insights}
          loading={loading}
          period={period}
          onAct={handleInsightAction}
          onDismiss={(title) => setInsights((prev) => prev.filter((i) => i.title !== title))}
          onMore={handleMoreInsights}
        />

        <ReportCard
          period={period}
          stats={stats}
          sedes={sedes}
          daily={daily}
          topItems={topItems}
          actions={actions}
          loading={loading}
          onSave={handleSaveReport}
          onShare={handleShareReport}
          onExport={handleExportPdf}
          onAskAction={handleSuggestedAction}
        />

        <SavedReports reports={[...savedLocal, ...saved]} onNew={handleNewSavedReport} onDelete={handleDeleteSaved} />
      </PageShell>

      <ChatPanel
        open={isChatOpen}
        onOpen={() => setIsChatOpen(true)}
        onClose={() => setIsChatOpen(false)}
        msgs={msgs}
        sending={sending}
        onSend={sendChat}
        onClear={() => setMsgs(INIT_MSGS)}
      />
    </>
  );
}
