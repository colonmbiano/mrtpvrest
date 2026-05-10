"use client";
import React, { useState, useEffect, useMemo } from "react";
import { LayoutGrid, Sparkles, Clock, Banknote, Brush } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

type ZoneRef = { id: string; name: string; icon: string | null };

interface ActiveOrderLite {
  id: string;
  orderNumber?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  total: number;
  customerName?: string | null;
  createdAt?: string | null;
  _count?: { items: number };
}

interface TableRow {
  id: string;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "DIRTY";
  zoneId: string | null;
  zone: ZoneRef | null;
  activeOrder: ActiveOrderLite | null;
}

interface Zone extends ZoneRef {
  order: number;
  tablesCount: number;
}

const NO_ZONE = "__none__";

// FASE 9 · TABLE PHASE — derivación local del estado visible
//
// El backend tiene 3 estados (AVAILABLE/OCCUPIED/DIRTY) pero la sala
// necesita 4 colores: añadimos "cobrando" cuando la cocina ya entregó
// pero el cliente aún no paga. Esto desbloquea visualmente la mesa
// "lista para cerrar cuenta" sin esperar a que cambie el status del
// table en backend.
type TablePhase = "libre" | "ocupada" | "cobrando" | "sucia";

function derivePhase(t: TableRow): TablePhase {
  if (t.status === "DIRTY") return "sucia";
  if (t.status === "AVAILABLE") return "libre";
  // OCCUPIED a partir de aquí. Marcamos "Cobrando" cuando la cocina ya
  // entregó (OrderStatus.READY) o el pago empezó (paymentStatus PAID).
  const o = t.activeOrder;
  if (o) {
    const s = (o.status || "").toUpperCase();
    const ps = (o.paymentStatus || "").toUpperCase();
    if (s === "READY" || ps === "PAID") return "cobrando";
  }
  return "ocupada";
}

const PHASE_COPY: Record<TablePhase, string> = {
  libre: "Libre",
  ocupada: "Ocupada",
  cobrando: "Cobrando",
  sucia: "Limpieza",
};

interface PhaseTone {
  ring: string;
  bg: string;
  fg: string;
  accent: string; // hex string for inline styles (glow, dot)
  dot: string;   // tailwind bg- class
  pulse: boolean;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
}

const PHASE_TONE: Record<TablePhase, PhaseTone> = {
  libre: {
    ring: "border-white/10",
    bg: "bg-white/5",
    fg: "text-white/80",
    accent: "rgba(255,255,255,0.4)",
    dot: "bg-white/40",
    pulse: false,
    Icon: Sparkles,
  },
  ocupada: {
    ring: "border-[#ffb84d]/50",
    bg: "bg-[#ffb84d]/10",
    fg: "text-[#ffb84d]",
    accent: "rgba(255,184,77,0.55)",
    dot: "bg-[#ffb84d]",
    pulse: true,
    Icon: Clock,
  },
  cobrando: {
    ring: "border-[#88D66C]/50",
    bg: "bg-[#88D66C]/10",
    fg: "text-[#88D66C]",
    accent: "rgba(136,214,108,0.55)",
    dot: "bg-[#88D66C]",
    pulse: true,
    Icon: Banknote,
  },
  sucia: {
    ring: "border-red-500/40",
    bg: "bg-red-500/10",
    fg: "text-red-400",
    accent: "rgba(239,68,68,0.5)",
    dot: "bg-red-500",
    pulse: false,
    Icon: Brush,
  },
};

function elapsedMin(iso?: string | null) {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

export default function WaiterFloorPlanPage() {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZone, setActiveZone] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [t, z] = await Promise.all([
          api.get<TableRow[]>("/api/tables"),
          api.get<Zone[]>("/api/zones").catch(() => ({ data: [] as Zone[] })),
        ]);
        setTables(t.data);
        setZones(z.data || []);
      } catch (error) {
        console.error("Error loading tables:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // Refresh ligero cada 45s — la sala no cambia de estado tan rápido
  // como para necesitar polling agresivo, pero queremos que "cobrando"
  // aparezca sin reload manual.
  useEffect(() => {
    const id = setInterval(() => {
      api
        .get<TableRow[]>("/api/tables")
        .then(({ data }) => setTables(data))
        .catch(() => {
          /* ignorar */
        });
    }, 45_000);
    return () => clearInterval(id);
  }, []);

  const hasOrphans = useMemo(
    () => tables.some((t) => !t.zoneId),
    [tables]
  );

  const filteredTables = useMemo(() => {
    if (activeZone === "all") return tables;
    if (activeZone === NO_ZONE) return tables.filter((t) => !t.zoneId);
    return tables.filter((t) => t.zoneId === activeZone);
  }, [tables, activeZone]);

  // Counters por phase para la leyenda — muestra "8 ocupadas · 3 cobrando"
  // con números reales de la planta entera (no del filtro de zona).
  const phaseCounts = useMemo(() => {
    const acc: Record<TablePhase, number> = {
      libre: 0,
      ocupada: 0,
      cobrando: 0,
      sucia: 0,
    };
    for (const t of tables) acc[derivePhase(t)] += 1;
    return acc;
  }, [tables]);

  return (
    <div
      className="h-full flex flex-col bg-[#0C0C0E] text-white"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* HEADER */}
      <div className="p-5 sm:p-7 border-b border-white/5 bg-[#0C0C0E] flex flex-col gap-6 shrink-0 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-32 -left-32 w-72 h-72 rounded-full blur-[80px] pointer-events-none opacity-50"
          style={{
            background:
              "radial-gradient(circle, rgba(255,184,77,0.15) 0%, transparent 70%)",
          }}
        />

        <div className="relative z-10 flex justify-between items-start gap-4">
          <div className="space-y-1.5 min-w-0">
            <span className="text-[10px] font-black tracking-[0.25em] text-[#ffb84d] uppercase">
              Gestión de salón
            </span>
            <h1 className="text-[clamp(1.75rem,5vw,2.5rem)] font-black tracking-tight text-white truncate leading-none">
              {activeZone === "all"
                ? "Planta completa"
                : activeZone === NO_ZONE
                ? "Sin zona"
                : zones.find((z) => z.id === activeZone)?.name || "Salón"}
            </h1>
          </div>
        </div>

        {/* LEGEND COLOR-CODED — fase 9 */}
        <div className="relative z-10 flex items-center gap-2 sm:gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {(["libre", "ocupada", "cobrando", "sucia"] as TablePhase[]).map(
            (p) => {
              const tone = PHASE_TONE[p];
              const count = phaseCounts[p];
              return (
                <div
                  key={p}
                  className={`shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-full border ${tone.ring} ${tone.bg}`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${tone.dot} ${
                      tone.pulse ? "animate-pulse" : ""
                    }`}
                  />
                  <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${tone.fg}`}>
                    {PHASE_COPY[p]}
                  </span>
                  <span className="text-[10px] font-black tabular-nums text-white/40">
                    · {count}
                  </span>
                </div>
              );
            }
          )}
        </div>

        {/* ZONE FILTERS */}
        {(zones.length > 0 || hasOrphans) && (
          <div className="relative z-10 flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => setActiveZone("all")}
              className={`shrink-0 h-12 min-h-[48px] px-5 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-all ${
                activeZone === "all"
                  ? "bg-[#ffb84d] border-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                  : "bg-white/5 border-white/10 text-white/60"
              }`}
            >
              General · {tables.length}
            </button>
            {zones.map((z) => {
              const count = tables.filter((t) => t.zoneId === z.id).length;
              const isActive = activeZone === z.id;
              return (
                <button
                  key={z.id}
                  onClick={() => setActiveZone(z.id)}
                  className={`shrink-0 h-12 min-h-[48px] px-5 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-all flex items-center gap-2 ${
                    isActive
                      ? "bg-[#ffb84d] border-[#ffb84d] text-[#0C0C0E] shadow-[0_5px_20px_rgba(255,184,77,0.3)]"
                      : "bg-white/5 border-white/10 text-white/60"
                  }`}
                >
                  {z.icon && <span className="text-sm">{z.icon}</span>}
                  <span>{z.name}</span>
                  <span className="opacity-50">/ {count}</span>
                </button>
              );
            })}
            {hasOrphans && (
              <button
                onClick={() => setActiveZone(NO_ZONE)}
                className={`shrink-0 h-12 min-h-[48px] px-5 rounded-2xl border text-[11px] font-black uppercase tracking-[0.15em] active:scale-95 transition-all ${
                  activeZone === NO_ZONE
                    ? "bg-white/15 border-white/30 text-white"
                    : "bg-white/5 border-white/10 text-white/60"
                }`}
              >
                Sin zona · {tables.filter((t) => !t.zoneId).length}
              </button>
            )}
          </div>
        )}
      </div>

      {/* GIANT TILES GRID */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 scrollbar-hide bg-[#0C0C0E]">
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5">
            {[...Array(10)].map((_, i) => (
              <div
                key={i}
                className="aspect-square bg-white/5 animate-pulse rounded-3xl border border-white/10"
              />
            ))}
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 gap-4 py-20 text-center">
            <LayoutGrid size={80} className="text-white/30" />
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white/40">
              Zona sin mesas configuradas
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 pb-32">
            {filteredTables.map((table) => {
              const phase = derivePhase(table);
              const tone = PHASE_TONE[phase];
              const PhaseIcon = tone.Icon;
              const order = table.activeOrder;
              const elapsed = order?.createdAt ? elapsedMin(order.createdAt) : null;

              return (
                <Link
                  key={table.id}
                  href={`/meseros/${table.id}`}
                  prefetch={false}
                  className={`group relative aspect-square min-h-[160px] rounded-[2rem] sm:rounded-[2.5rem] p-4 sm:p-5 flex flex-col items-stretch justify-between border-2 ${tone.ring} ${tone.bg} backdrop-blur-md overflow-hidden active:scale-[0.97] transition-transform`}
                >
                  {/* Glow accent */}
                  <div
                    aria-hidden
                    className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-[60px] pointer-events-none opacity-50"
                    style={{
                      background: `radial-gradient(circle, ${tone.accent} 0%, transparent 70%)`,
                    }}
                  />

                  {/* TOP — name + dot */}
                  <div className="relative z-10 flex justify-between items-start w-full gap-2">
                    <span
                      className={`text-[clamp(2rem,5vw,3rem)] font-black tracking-tighter leading-none ${tone.fg}`}
                    >
                      {table.name.replace(/^Mesa\s+/i, "M")}
                    </span>
                    <span
                      className={`shrink-0 w-3 h-3 rounded-full ${tone.dot} shadow-lg ${
                        tone.pulse ? "animate-pulse" : ""
                      }`}
                    />
                  </div>

                  {/* CENTER — total destacado cuando hay orden */}
                  {order && phase !== "sucia" && (
                    <div className="relative z-10 flex flex-col items-center justify-center flex-1">
                      <div
                        className={`tabular-nums text-[clamp(1.5rem,4vw,2.25rem)] font-black tracking-tight ${tone.fg}`}
                      >
                        ${Number(order.total).toFixed(0)}
                      </div>
                      {elapsed != null && (
                        <div className="text-[10px] font-bold text-white/50 tabular-nums uppercase tracking-wider mt-1">
                          {elapsed} min
                        </div>
                      )}
                    </div>
                  )}

                  {/* BOTTOM — status pill */}
                  <div className="relative z-10 flex items-center gap-2 min-w-0">
                    <PhaseIcon
                      size={14}
                      strokeWidth={2.5}
                      className={`shrink-0 ${tone.fg}`}
                    />
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.2em] truncate ${tone.fg}`}
                    >
                      {PHASE_COPY[phase]}
                    </span>
                    {table.zone && (
                      <>
                        <span className="text-white/20 shrink-0">·</span>
                        <span className="text-[10px] font-bold text-white/50 truncate">
                          {table.zone.name}
                        </span>
                      </>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
