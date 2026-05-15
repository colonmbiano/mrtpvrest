"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  RefreshCcw,
  Download,
  Copy,
  Check,
  Search,
  ChevronRight,
  Brain,
} from "lucide-react";
import api from "@/lib/api";

// ── Tipos ─────────────────────────────────────────────────────────────────

type SystemLogLevel = "INFO" | "WARN" | "ERROR" | "CRITICAL";

interface SystemLogRecord {
  id: string;
  level: SystemLogLevel;
  message: string;
  stack: string | null;
  path: string | null;
  method: string | null;
  tenantId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface DbLogsResponse {
  total: number;
  records: SystemLogRecord[];
}

// ── Constantes ────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4_000;
const ALL_LEVELS: SystemLogLevel[] = ["CRITICAL", "ERROR", "WARN", "INFO"];

const LEVEL_STYLE: Record<SystemLogLevel, { bg: string; fg: string; border: string; active: string }> = {
  CRITICAL: { bg: "rgba(239,68,68,0.1)", fg: "#ef4444", border: "#ef4444", active: "bg-red-500 text-white" },
  ERROR:    { bg: "rgba(239,68,68,0.08)", fg: "#f87171", border: "#f87171", active: "bg-red-400 text-white" },
  WARN:     { bg: "rgba(245,158,11,0.1)", fg: "#f59e0b", border: "#f59e0b", active: "bg-amber-500 text-white" },
  INFO:     { bg: "rgba(59,130,246,0.1)", fg: "#3b82f6", border: "#3b82f6", active: "bg-blue-500 text-white" },
};

// ── Página ────────────────────────────────────────────────────────────────

export default function SaasErrorsPage() {
  const [records, setRecords] = useState<SystemLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused]   = useState(false);
  const [error, setError]     = useState("");
  const [filterLevel, setFilterLevel] = useState<SystemLogLevel | "ALL">("ALL");
  const [search, setSearch]   = useState("");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied]   = useState(false);

  // Polling SystemLog DB.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (paused || cancelled) return;
      try {
        const params: Record<string, string> = { limit: "200" };
        if (filterLevel !== "ALL") {
          params.level = filterLevel;
        }
        const { data } = await api.get<DbLogsResponse>("/api/admin/logs/db", { params });
        if (cancelled) return;
        setRecords(data.records);
        setError("");
      } catch (err) {
        const e = err as { response?: { status?: number; data?: { error?: string } } };
        if (e.response?.status === 403) setError("Solo SUPER_ADMIN.");
        else if (e.response?.status === 401) setError("Sesión expirada.");
        else setError("Error al conectar con backend.");
      } finally {
        setLoading(false);
        if (!cancelled) timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paused, filterLevel]);

  const filtered = useMemo<SystemLogRecord[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      return (
        r.message.toLowerCase().includes(q) ||
        (r.path || "").toLowerCase().includes(q) ||
        (r.tenantId || "").toLowerCase().includes(q) ||
        (r.method || "").toLowerCase().includes(q)
      );
    });
  }, [records, search]);

  const downloadExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get("/api/admin/logs/export", {
        params: { minLevel: "ERROR", limit: 500 },
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mrtpvrest-errors-${new Date().toISOString().slice(0, 19)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch { /* ignored */ } finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      {/* Header (Mobile Design) */}
      <div className="px-4 py-6 md:px-10">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Errores <span className="bg-red-500/20 text-red-500 px-2 py-0.5 rounded-lg text-xs tabular-nums">{records.length}</span>
            </h1>
            <p className="text-xs text-white/40 font-medium">Observabilidad global del SaaS</p>
          </div>
          <button
            onClick={() => setPaused(!paused)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${paused ? "bg-amber-500/20 text-amber-500" : "bg-white/5 text-white/40"}`}
          >
            <RefreshCcw size={18} className={paused ? "" : "animate-spin-slow"} />
          </button>
        </div>

        {/* Filter Chips (Horizontal Scroll) */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-4 -mx-4 px-4 no-scrollbar">
          <button
            onClick={() => setFilterLevel("ALL")}
            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filterLevel === "ALL" ? "bg-white text-black" : "bg-white/5 text-white/40 border border-white/10"}`}
          >
            Todos
          </button>
          {ALL_LEVELS.map(lvl => (
            <button
              key={lvl}
              onClick={() => setFilterLevel(lvl)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filterLevel === lvl ? LEVEL_STYLE[lvl].active : "bg-white/5 text-white/40 border border-white/10"}`}
            >
              {lvl}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por mensaje, path, tenant..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm outline-none focus:border-white/20 transition-all"
          />
        </div>

        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs font-bold">
            {error}
          </div>
        )}

        {/* Error List */}
        <div className="space-y-3 pb-32">
          {loading && records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/20">
              <Loader2 className="animate-spin mb-4" size={32} />
              <p className="text-sm font-bold">Conectando con SystemLog...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-white/20">
              <Activity className="mb-4" size={32} />
              <p className="text-sm font-bold">Sin errores detectados</p>
            </div>
          ) : (
            filtered.map((r) => <ErrorRow key={r.id} record={r} />)
          )}
        </div>
      </div>

      {/* Desktop Actions Footer */}
      <div className="hidden md:flex fixed bottom-6 left-1/2 -translate-x-1/2 bg-surface-1 border border-border px-6 py-3 rounded-2xl items-center gap-4 shadow-2xl z-[100]">
        <button onClick={downloadExport} disabled={exporting} className="flex items-center gap-2 text-xs font-bold hover:text-brand transition-colors disabled:opacity-50">
          <Download size={14} /> Exportar JSON
        </button>
      </div>

      <style jsx>{`
        .animate-spin-slow { animation: spin 4s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function ErrorRow({ record }: { record: SystemLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const s = LEVEL_STYLE[record.level] || LEVEL_STYLE.INFO;
  const time = new Date(record.createdAt).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", hour12: false
  });

  const copyStack = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (record.stack) navigator.clipboard.writeText(record.stack);
  };

  return (
    <div 
      onClick={() => setExpanded(!expanded)}
      className="bg-surface-1 border border-white/5 rounded-2xl overflow-hidden transition-all active:scale-[0.98]"
      style={{ borderLeft: `4px solid ${s.border}` }}
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md" style={{ background: s.bg, color: s.fg }}>
              {record.level}
            </span>
            <span className="text-[10px] font-mono text-white/30">{time}</span>
          </div>
          <ChevronRight size={14} className={`text-white/20 transition-transform ${expanded ? "rotate-90" : ""}`} />
        </div>
        
        <p className="text-sm font-bold text-white/90 line-clamp-2 leading-relaxed">
          {record.message}
        </p>

        {record.path && (
          <div className="mt-2 text-[10px] font-mono text-white/30 flex items-center gap-2">
            <span className="bg-white/5 px-1.5 py-0.5 rounded">{record.method}</span>
            <span className="truncate">{record.path}</span>
          </div>
        )}

        {expanded && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {record.stack && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Stack Trace</span>
                  <button onClick={copyStack} className="p-1.5 bg-white/5 rounded-lg text-white/40 hover:text-white transition-colors">
                    <Copy size={12} />
                  </button>
                </div>
                <pre className="text-[9.5px] font-mono text-white/50 bg-black/40 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all border border-white/5">
                  {record.stack}
                </pre>
              </div>
            )}

            <div className="flex gap-2">
              <button 
                className="flex-1 bg-white/5 py-2 rounded-xl text-[10px] font-bold text-white/60 flex items-center justify-center gap-2 hover:bg-white/10"
                onClick={(e) => { e.stopPropagation(); /* AI Logic here */ }}
              >
                <Brain size={12} /> Analizar IA
              </button>
              <button 
                className="flex-1 bg-white/5 py-2 rounded-xl text-[10px] font-bold text-white/60 flex items-center justify-center gap-2 hover:bg-white/10"
                onClick={copyStack}
              >
                <Copy size={12} /> Copiar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2v4" />
      <path d="m16.2 7.8 2.9-2.9" />
      <path d="M18 12h4" />
      <path d="m16.2 16.2 2.9 2.9" />
      <path d="M12 18v4" />
      <path d="m4.9 19.1 2.9-2.9" />
      <path d="M2 12h4" />
      <path d="m4.9 4.9 2.9 2.9" />
    </svg>
  );
}
