"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Filter,
  RefreshCcw,
  Download,
  Copy,
  Check,
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

const LEVEL_STYLE: Record<SystemLogLevel, { bg: string; fg: string; halo: string }> = {
  CRITICAL: { bg: "rgba(255,92,51,0.20)",  fg: "#FF8B6E", halo: "rgba(255,92,51,0.30)"  },
  ERROR:    { bg: "rgba(255,92,51,0.12)",  fg: "#FF8B6E", halo: "rgba(255,92,51,0.20)"  },
  WARN:     { bg: "rgba(255,184,77,0.15)", fg: "#ffb84d", halo: "rgba(255,184,77,0.25)" },
  INFO:     { bg: "rgba(136,214,108,0.10)",fg: "#88D66C", halo: "rgba(136,214,108,0.20)"},
};

// ── Página ────────────────────────────────────────────────────────────────

export default function SaasErrorsPage() {
  const [records, setRecords] = useState<SystemLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused]   = useState(false);
  const [error, setError]     = useState("");
  const [activeLevels, setActiveLevels] = useState<Set<SystemLogLevel>>(
    new Set(["CRITICAL", "ERROR"])
  );
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
        if (activeLevels.size > 0 && activeLevels.size < ALL_LEVELS.length) {
          params.level = Array.from(activeLevels).join(",");
        }
        const { data } = await api.get<DbLogsResponse>("/api/admin/logs/db", { params });
        if (cancelled) return;
        setRecords(data.records);
        setError("");
      } catch (err) {
        const e = err as { response?: { status?: number; data?: { error?: string } } };
        if (e.response?.status === 403) setError("Solo SUPER_ADMIN.");
        else if (e.response?.status === 401) setError("Sesión expirada. Vuelve a iniciar sesión.");
        else setError(e.response?.data?.error || "No pudimos contactar el backend.");
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
  }, [paused, activeLevels]);

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

  const counts = useMemo(() => {
    const c: Record<SystemLogLevel, number> = { CRITICAL: 0, ERROR: 0, WARN: 0, INFO: 0 };
    for (const r of records) if (r.level in c) c[r.level] += 1;
    return c;
  }, [records]);

  const toggleLevel = (lvl: SystemLogLevel) => {
    setActiveLevels((prev) => {
      const next = new Set(prev);
      if (next.has(lvl)) next.delete(lvl);
      else next.add(lvl);
      return next;
    });
  };

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
    } catch {
      /* ignored */
    } finally {
      setExporting(false);
    }
  };

  const copyExport = async () => {
    try {
      const { data } = await api.get("/api/admin/logs/export", {
        params: { minLevel: "ERROR", limit: 200 },
      });
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignored */
    }
  };

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: "#0a0a0c", color: "white", fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Halo glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-40 w-[700px] h-[700px] rounded-full blur-[140px] opacity-50"
        style={{ background: "radial-gradient(circle, rgba(255,92,51,0.20) 0%, transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[400px] -right-40 w-[700px] h-[700px] rounded-full blur-[140px] opacity-40"
        style={{ background: "radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10 py-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-6 flex-wrap mb-8">
          <div>
            <p className="text-[10px] font-black tracking-[0.3em] text-white/40 mb-2">
              SUPER · OBSERVABILIDAD
            </p>
            <h1 className="text-4xl font-black text-white tracking-tight flex items-center gap-3">
              <AlertTriangle size={32} className="text-[#FF8B6E]" />
              Errores del backend
            </h1>
            <p className="text-base font-medium text-white/55 mt-2 max-w-2xl">
              Eventos persistidos en <code className="text-[#ffb84d]">SystemLog</code> por el
              middleware global de <code className="text-[#ffb84d]">api.mrtpvrest.com</code>.
              Los <strong>CRITICAL</strong> también disparan <code>notifyAdmin()</code>.
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setPaused((p) => !p)}
              className={`inline-flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-2xl text-xs font-black tracking-wider active:scale-95 transition-transform ${
                paused
                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40"
                  : "bg-white/5 border border-white/10 text-white/85"
              }`}
            >
              <RefreshCcw size={14} className={paused ? "" : "animate-spin"} style={{ animationDuration: "3s" }} />
              {paused ? "Pausado" : "Live"}
            </button>
            <button
              type="button"
              onClick={copyExport}
              className="inline-flex items-center gap-2 px-4 py-3 min-h-[48px] rounded-2xl text-xs font-black tracking-wider bg-white/5 border border-white/10 text-white/85 active:scale-95 transition-transform"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              {copied ? "Copiado" : "Copy MCP"}
            </button>
            <button
              type="button"
              onClick={downloadExport}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-5 py-3 min-h-[48px] rounded-2xl text-xs font-black tracking-wider text-[#0a0a0c] bg-[#ffb84d] active:scale-95 transition-transform shadow-[0_15px_40px_rgba(255,184,77,0.30)] disabled:opacity-40"
            >
              <Download size={14} strokeWidth={3} />
              {exporting ? "Exportando…" : "Export MCP"}
            </button>
          </div>
        </div>

        {/* Counters Halo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {ALL_LEVELS.map((lvl) => {
            const s = LEVEL_STYLE[lvl];
            const active = activeLevels.has(lvl);
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => toggleLevel(lvl)}
                className="relative p-5 rounded-3xl bg-white/5 backdrop-blur-md border overflow-hidden text-left active:scale-95 transition-transform"
                style={{
                  borderColor: active ? s.fg + "40" : "rgba(255,255,255,0.10)",
                  boxShadow: active
                    ? `0 30px 60px ${s.halo}, inset 0 0 0 1px ${s.fg}30`
                    : "0 12px 30px rgba(0,0,0,0.30)",
                }}
              >
                <div
                  aria-hidden
                  className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-[80px]"
                  style={{ background: s.halo, opacity: active ? 0.8 : 0.3 }}
                />
                <span
                  className="relative text-[10px] font-black tracking-[0.25em]"
                  style={{ color: active ? s.fg : "rgba(255,255,255,0.40)" }}
                >
                  {lvl}
                </span>
                <div className="relative text-3xl font-black tabular-nums tracking-tight mt-1 text-white">
                  {counts[lvl]}
                </div>
                <span className="relative text-[11px] font-bold text-white/40">
                  {active ? "filtrando" : "click para activar"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Filter size={16} className="text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por mensaje, path, método, tenantId…"
            className="flex-1 min-w-[260px] px-4 py-3 rounded-2xl text-sm font-medium bg-white/5 backdrop-blur-md border border-white/10 outline-none focus:border-[#ffb84d]/40 transition-colors text-white"
          />
          <span className="text-xs font-bold text-white/40 tabular-nums">
            {filtered.length} / {records.length} eventos
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-2xl p-3 text-sm font-semibold bg-[rgba(255,92,51,0.10)] border border-[rgba(255,92,51,0.30)] text-[#FF8B6E]">
            {error}
          </div>
        )}

        <div className="rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,0.40)]">
          {loading && records.length === 0 ? (
            <p className="text-white/40 text-sm font-bold py-16 text-center">
              <Activity size={20} className="inline-block mr-2 animate-pulse" />
              Conectando con SystemLog…
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-white/40 text-sm font-bold py-16 text-center">
              Sin errores que coincidan con el filtro. ¡Buen estado!
            </p>
          ) : (
            <ul className="divide-y divide-white/5 max-h-[68vh] overflow-y-auto">
              {filtered.map((r) => (
                <ErrorRow key={r.id} record={r} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ErrorRow({ record }: { record: SystemLogRecord }) {
  const [expanded, setExpanded] = useState(false);
  const s = LEVEL_STYLE[record.level] || LEVEL_STYLE.ERROR;
  const time = new Date(record.createdAt).toLocaleString("es-MX", {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    day: "2-digit", month: "2-digit", hour12: false,
  });

  return (
    <li>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-4 flex items-start gap-4 hover:bg-white/5 transition-colors text-left"
      >
        <span
          className="text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full flex-shrink-0 mt-0.5"
          style={{ background: s.bg, color: s.fg }}
        >
          {record.level}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono text-white/40 mb-1">
            <span>{time}</span>
            {record.method && record.path && (
              <span className="text-[#ffb84d]/80">
                {record.method} {record.path}
              </span>
            )}
            {record.tenantId && (
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                tenant: {record.tenantId.slice(-8)}
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-white tracking-tight break-words">
            {record.message}
          </p>
          {expanded && (
            <div className="mt-3 space-y-2">
              {record.stack && (
                <pre className="text-[10px] font-mono text-white/60 bg-black/30 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-words border border-white/5">
                  {record.stack}
                </pre>
              )}
              {record.metadata && Object.keys(record.metadata).length > 0 && (
                <pre className="text-[10px] font-mono text-white/60 bg-black/30 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-words border border-white/5">
                  {JSON.stringify(record.metadata, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] font-bold text-white/30 flex-shrink-0 mt-1">
          {expanded ? "−" : "+"}
        </span>
      </button>
    </li>
  );
}
