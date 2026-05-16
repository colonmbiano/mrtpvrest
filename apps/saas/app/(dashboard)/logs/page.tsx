"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Bell, RefreshCcw, Search, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";
import api from "@/lib/api";

interface Tenant {
  id: string; name: string; slug: string; createdAt: string;
  onboardingDone: boolean; onboardingStep: number;
  subscription: { status: string; trialEndsAt: string | null; plan: { displayName: string } | null } | null;
}

interface LogEntry {
  id: string; 
  type: "register" | "trial_warn" | "expired" | "active" | "suspended" | "error";
  severity: "CRITICAL" | "WARNING" | "INFO";
  tenant: string; 
  detail: string; 
  time: string; 
  color: string;
  emoji: string;
  acked?: boolean;
}

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "var(--red)",
  WARNING:  "var(--amber)",
  INFO:     "var(--blue)",
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return "ahora";
  if (m < 60) return `hace ${m}m`;
  if (h < 24) return `hace ${h}h`;
  if (d < 7)  return `hace ${d}d`;
  return new Date(iso).toLocaleDateString("es-MX", { day:"2-digit", month:"short" });
}

function buildLogs(tenants: Tenant[]): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const t of tenants) {
    logs.push({ 
      id: `reg-${t.id}`, type:"register", severity: "INFO", tenant: t.name,
      detail: `Se registró → plan ${t.subscription?.plan?.displayName ?? "trial"}`,
      time: t.createdAt, color: "var(--blue)", emoji: "👤" 
    });

    if (t.subscription?.status === "ACTIVE") {
      logs.push({ 
        id: `act-${t.id}`, type:"active", severity: "INFO", tenant: t.name,
        detail: "Suscripción activada — pagando",
        time: t.createdAt, color: "var(--green)", emoji: "💰" 
      });
    }
    if (t.subscription?.status === "SUSPENDED") {
      logs.push({ 
        id: `sus-${t.id}`, type:"suspended", severity: "CRITICAL", tenant: t.name,
        detail: "Cuenta suspendida",
        time: t.subscription.trialEndsAt ?? t.createdAt, color: "var(--red)", emoji: "🚫" 
      });
    }
    if (t.subscription?.status === "EXPIRED") {
      logs.push({ 
        id: `exp-${t.id}`, type:"expired", severity: "WARNING", tenant: t.name,
        detail: "Trial expirado sin conversión",
        time: t.subscription.trialEndsAt ?? t.createdAt, color: "var(--orange)", emoji: "⏳" 
      });
    }
    if (t.subscription?.status === "TRIAL" && t.subscription.trialEndsAt) {
      const days = Math.ceil((new Date(t.subscription.trialEndsAt).getTime() - Date.now()) / 86400000);
      if (days >= 0 && days <= 3) {
        logs.push({ 
          id: `warn-${t.id}`, type:"trial_warn", severity: "WARNING", tenant: t.name,
          detail: `Trial vence en ${days}d — sin convertir`,
          time: new Date().toISOString(), color: "var(--amber)", emoji: "⚠️" 
        });
      }
    }
  }
  return logs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}

export default function AlertasPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<"ALL" | "CRITICAL" | "WARNING">("ALL");
  const [search,  setSearch]  = useState("");
  const [acked, setAcked] = useState<Set<string>>(new Set());

  const fetchTenants = () => {
    setLoading(true);
    api.get("/api/saas/tenants").catch(() => ({ data: [] }))
      .then(r => { setTenants(r.data); setLoading(false); });
  };

  useEffect(() => { fetchTenants(); }, []);

  const allLogs = useMemo(() => buildLogs(tenants), [tenants]);
  
  const filteredLogs = useMemo(() => {
    return allLogs.filter(l => {
      const matchFilter = filter === "ALL" || l.severity === filter;
      const matchSearch = l.tenant.toLowerCase().includes(search.toLowerCase()) ||
                          l.detail.toLowerCase().includes(search.toLowerCase());
      return matchFilter && matchSearch;
    });
  }, [allLogs, filter, search]);

  const toggleAck = (id: string) => {
    setAcked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleInvestigate = (tenant: string) => {
    router.push(`/marcas?q=${encodeURIComponent(tenant)}`);
  };

  const criticalCount = allLogs.filter(l => l.severity === "CRITICAL" && !acked.has(l.id)).length;

  return (
    <div className="min-h-screen bg-[#080810] text-white">
      {/* Header */}
      <div className="px-4 py-6 md:px-10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              Alertas 
              {criticalCount > 0 && (
                <span className="bg-red-500 text-white px-2 py-0.5 rounded-lg text-xs tabular-nums animate-pulse">
                  {criticalCount}
                </span>
              )}
            </h1>
          </div>
          <button
            onClick={fetchTenants}
            className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 active:scale-95 transition-all"
          >
            <RefreshCcw size={18} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Filter Chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide py-4 -mx-4 px-4 no-scrollbar">
          <button
            onClick={() => setFilter("ALL")}
            className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === "ALL" ? "bg-brand text-white" : "bg-white/5 text-white/40 border border-white/10"}`}
            style={filter === "ALL" ? { background: "var(--orange)" } : {}}
          >
            Todas
          </button>
          <button
            onClick={() => setFilter("CRITICAL")}
            className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === "CRITICAL" ? "bg-red-500 text-white" : "bg-white/5 text-white/40 border border-white/10"}`}
          >
            Críticas
          </button>
          <button
            onClick={() => setFilter("WARNING")}
            className={`px-5 py-2.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${filter === "WARNING" ? "bg-amber-500 text-white" : "bg-white/5 text-white/40 border border-white/10"}`}
          >
            Warnings
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar marca o evento..."
            className="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-11 pr-4 text-sm outline-none focus:border-white/20 transition-all"
          />
        </div>

        {/* Alert Cards */}
        <div className="space-y-4 pb-32">
          {loading && allLogs.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-white/20">
              <RefreshCcw className="animate-spin mb-4" size={32} />
              <p className="text-sm font-bold tracking-widest uppercase">Cargando alertas...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-white/20">
              <Bell className="mb-4" size={32} />
              <p className="text-sm font-bold tracking-widest uppercase">Sin alertas pendientes</p>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <AlertCard 
                key={log.id} 
                log={log} 
                isAcked={acked.has(log.id)}
                onToggleAck={() => toggleAck(log.id)}
                onInvestigate={() => handleInvestigate(log.tenant)}
              />
            ))
          )}
        </div>
      </div>

      <style jsx>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

function AlertCard({ log, isAcked, onToggleAck, onInvestigate }: { log: LogEntry, isAcked: boolean, onToggleAck: () => void, onInvestigate: () => void }) {
  return (
    <div className={`bg-surface-1 border border-white/5 rounded-2xl p-4 transition-all ${isAcked ? "opacity-40" : ""}`}>
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-xl shrink-0">
          {log.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-bold text-white truncate">{log.tenant}</h3>
            <span className="text-[10px] font-mono text-white/30 shrink-0">{timeAgo(log.time)}</span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md`} 
              style={{ background: `${SEVERITY_COLOR[log.severity]}22`, color: SEVERITY_COLOR[log.severity] }}>
              {log.severity}
            </span>
            {isAcked && (
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/5 text-white/40">
                ACK
              </span>
            )}
          </div>
          <p className="text-xs text-white/60 leading-relaxed mb-4">
            {log.detail}
          </p>
          <div className="flex gap-2">
            <button 
              onClick={onToggleAck}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 transition-all ${isAcked ? "bg-white/5 text-white/40" : "bg-white/10 text-white hover:bg-white/20"}`}
            >
              {isAcked ? <CheckCircle size={12} /> : "Marcar ACK"}
            </button>
            <button 
              onClick={onInvestigate}
              className="flex-1 py-2.5 rounded-xl text-[10px] font-bold bg-brand/10 text-brand flex items-center justify-center gap-2 hover:bg-brand/20 transition-all"
              style={{ background: "var(--orange-dim)", color: "var(--orange)" }}
            >
              Investigar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
