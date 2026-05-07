"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Filter, Pause, Play, Trash2 } from "lucide-react";
import api from "@/lib/api";
import BackButton from "@/components/BackButton";

// ── Tipos ─────────────────────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogRecord {
  t: string;        // ISO timestamp
  level: LogLevel;
  module: string;
  event: string;
  // Campos arbitrarios extras del logger (path, method, ip, err, etc.)
  [key: string]: unknown;
}

interface LogsResponse {
  capacity: number;
  total: number;
  serverNow: string;
  records: LogRecord[];
}

// ── Constantes UI ─────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const MAX_LOCAL_BUFFER = 1000;
const ALL_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

const LEVEL_STYLE: Record<LogLevel, { bg: string; fg: string; label: string }> = {
  error: { bg: "rgba(255,92,51,0.15)",  fg: "#FF8B6E", label: "ERROR" },
  warn:  { bg: "rgba(255,184,77,0.15)", fg: "#ffb84d", label: "WARN"  },
  info:  { bg: "rgba(136,214,108,0.12)",fg: "#88D66C", label: "INFO"  },
  debug: { bg: "rgba(255,255,255,0.06)",fg: "#aaa",    label: "DEBUG" },
};

// ── Página ────────────────────────────────────────────────────────────────

export default function LogsPage() {
  const [records, setRecords] = useState<LogRecord[]>([]);
  const [paused,  setPaused]  = useState<boolean>(false);
  const [filterLevels, setFilterLevels] = useState<Set<LogLevel>>(new Set(ALL_LEVELS));
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [error, setError]   = useState<string>("");
  const [loading, setLoading] = useState(true);
  const cursorRef = useRef<string>(""); // último timestamp visto

  // Polling incremental con cursor por timestamp.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (paused || cancelled) return;
      try {
        const params: Record<string, string> = { limit: "200" };
        if (cursorRef.current) params.since = cursorRef.current;
        const { data } = await api.get<LogsResponse>("/api/admin/logs", { params });
        if (cancelled) return;

        if (data.records.length > 0) {
          setRecords((prev) => {
            const merged = [...prev, ...data.records];
            // Cap local para no consumir RAM sin techo.
            return merged.length > MAX_LOCAL_BUFFER
              ? merged.slice(merged.length - MAX_LOCAL_BUFFER)
              : merged;
          });
          cursorRef.current = data.records[data.records.length - 1].t;
        }
        setError("");
      } catch (err) {
        const e = err as { response?: { status?: number; data?: { error?: string } } };
        if (e.response?.status === 403) {
          setError("Solo SUPER_ADMIN puede ver los logs.");
        } else if (e.response?.status === 401) {
          setError("Sesión expirada. Vuelve a iniciar sesión.");
        } else {
          setError(e.response?.data?.error || "No pudimos contactar el backend.");
        }
      } finally {
        setLoading(false);
        if (!cancelled) {
          timer = setTimeout(tick, POLL_INTERVAL_MS);
        }
      }
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paused]);

  // Filtrado client-side.
  const filtered = useMemo<LogRecord[]>(() => {
    const mod = moduleFilter.trim().toLowerCase();
    return records.filter((r) => {
      if (!filterLevels.has(r.level)) return false;
      if (mod && !r.module?.toLowerCase().includes(mod)) return false;
      return true;
    });
  }, [records, filterLevels, moduleFilter]);

  const toggleLevel = (lvl: LogLevel) => {
    setFilterLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

  const clear = () => {
    setRecords([]);
    cursorRef.current = "";
  };

  return (
    <div
      className="relative min-h-full bg-[#0a0a0c] text-white p-6 md:p-8"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full blur-[120px] opacity-25"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        {/* HEADER */}
        <div className="flex items-start gap-4 mb-6">
          <BackButton ariaLabel="Volver al panel admin" />
          <div className="flex-1">
            <p className="text-[10px] font-black tracking-[0.25em] text-white/40">DIAGNÓSTICO</p>
            <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-2">
              <Activity size={26} className="text-[#ffb84d]" /> Logs api.mrtpvrest.com
            </h1>
            <p className="text-sm font-medium text-white/55 mt-1">
              Stream en vivo del backend. Buffer de 500 registros más recientes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className={`inline-flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-2xl text-xs font-black tracking-wider active:scale-95 transition-transform ${
              paused ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40" : "bg-white/5 border border-white/10 text-white/85"
            }`}
          >
            {paused ? <><Play size={14} /> Reanudar</> : <><Pause size={14} /> Pausar</>}
          </button>
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-2xl text-xs font-black tracking-wider bg-white/5 border border-white/10 text-white/85 active:scale-95 transition-transform"
          >
            <Trash2 size={14} /> Limpiar
          </button>
        </div>

        {/* FILTROS */}
        <div className="flex items-center gap-3 flex-wrap mb-4 px-1">
          <Filter size={14} className="text-white/40" />
          {ALL_LEVELS.map((lvl) => {
            const active = filterLevels.has(lvl);
            const s = LEVEL_STYLE[lvl];
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleLevel(lvl)}
                className="px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest active:scale-95 transition-transform"
                style={{
                  background: active ? s.bg : "rgba(255,255,255,0.04)",
                  color:      active ? s.fg : "rgba(255,255,255,0.35)",
                  border:     active ? `1px solid ${s.fg}40` : "1px solid rgba(255,255,255,0.05)",
                }}
              >
                {s.label}
              </button>
            );
          })}
          <input
            type="text"
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            placeholder="filtrar por módulo (auth, tasks, …)"
            className="flex-1 min-w-[200px] px-4 py-2 rounded-2xl text-xs font-medium bg-white/5 border border-white/10 outline-none focus:border-[#ffb84d]/40 transition-colors"
          />
          <span className="text-[10px] font-bold text-white/40 tabular-nums">
            {filtered.length} / {records.length}
          </span>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-4 rounded-2xl p-3 text-xs font-semibold bg-[rgba(255,92,51,0.10)] border border-[rgba(255,92,51,0.30)] text-[#FF8B6E]">
            {error}
          </div>
        )}

        {/* LIST */}
        <div className="rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 overflow-hidden">
          {loading && records.length === 0 ? (
            <p className="text-white/40 text-sm font-bold py-12 text-center">Conectando con el backend…</p>
          ) : filtered.length === 0 ? (
            <p className="text-white/40 text-sm font-bold py-12 text-center">
              Sin registros que coincidan con el filtro.
            </p>
          ) : (
            <ul className="divide-y divide-white/5 max-h-[70vh] overflow-y-auto">
              {filtered.slice().reverse().map((r, idx) => (
                <LogRow key={`${r.t}-${idx}`} record={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Subcomponente: fila de log ────────────────────────────────────────────

function LogRow({ record }: { record: LogRecord }) {
  const s = LEVEL_STYLE[record.level] || LEVEL_STYLE.info;
  const time = new Date(record.t).toLocaleTimeString("es-MX", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  // Extraer campos extra (todo lo que no sea t/level/module/event).
  const extras: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (k === "t" || k === "level" || k === "module" || k === "event") continue;
    extras[k] = v;
  }
  const hasExtras = Object.keys(extras).length > 0;

  return (
    <li className="px-4 py-2.5 flex items-start gap-3 hover:bg-white/5 transition-colors">
      <span className="text-[10px] font-mono text-white/40 tabular-nums pt-1 flex-shrink-0">
        {time}
      </span>
      <span
        className="text-[9px] font-black tracking-widest px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5"
        style={{ background: s.bg, color: s.fg }}
      >
        {s.label}
      </span>
      <span
        className="text-[10px] font-mono text-[#ffb84d]/80 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5"
        style={{ background: "rgba(255,184,77,0.06)" }}
      >
        {record.module}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white tracking-tight break-words">
          {record.event}
        </div>
        {hasExtras && (
          <pre
            className="mt-1 text-[10px] font-mono text-white/55 break-words whitespace-pre-wrap"
            style={{ wordBreak: "break-word" }}
          >
            {JSON.stringify(extras, null, 2)}
          </pre>
        )}
      </div>
    </li>
  );
}
