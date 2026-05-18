"use client";
import { useEffect, useRef, useState } from "react";
import api from "@/lib/api";

// Planímetro de mesas para Dine-in.
//
// mode="manage" → CRUD + drag-drop + save layout. Botón "Marcar limpia" en
//   mesas DIRTY. Borrar mesas con cuenta abierta queda bloqueado por el
//   backend (devuelve 400).
// mode="pick"   → solo lectura, click en una mesa AVAILABLE ejecuta onPick
//   con la mesa seleccionada. Mesas OCCUPIED/DIRTY no son seleccionables.
//
// Coordenadas: x/y en píxeles relativos al canvas (700×500 default).
// Fuera de canvas se clampea al guardar para que ninguna mesa quede oculta.

type TableStatus = "AVAILABLE" | "OCCUPIED" | "DIRTY";

type ActiveOrder = {
  id: string;
  orderNumber: string;
  total: number;
  customerName: string | null;
  createdAt: string;
  _count?: { items: number };
};

// Umbral de minutos para colorear una mesa OCCUPIED por tiempo abierto.
// El color del borde y el badge se ajustan según en qué bucket cae la
// orden activa, dándole al gerente una señal visual de mesas que llevan
// demasiado tiempo (ej. esperan cuenta, sobremesa larga, etc.).
const TIME_BUCKETS = [
  { min: 0,  max: 30, color: "#22c55e", label: "0-30m" },
  { min: 30, max: 60, color: "#eab308", label: "30-60m" },
  { min: 60, max: 90, color: "#f97316", label: "60-90m" },
  { min: 90, max: Infinity, color: "#a855f7", label: "90m+" },
] as const;

function bucketForMinutes(min: number) {
  return TIME_BUCKETS.find((b) => min >= b.min && min < b.max) ?? TIME_BUCKETS[TIME_BUCKETS.length - 1];
}

function minutesSince(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, (Date.now() - t) / 60000);
}

type Zone = {
  id: string;
  name: string;
  icon: string | null;
};

type TableRow = {
  id: string;
  name: string;
  x: number;
  y: number;
  status: TableStatus;
  isActive: boolean;
  zoneId: string | null;
  zone: Zone | null;
  activeOrder: ActiveOrder | null;
};

type Mode = "manage" | "pick";

type Props = {
  open: boolean;
  mode?: Mode;
  onClose: () => void;
  onPick?: (table: TableRow) => void;
  accent: string;
};

const CANVAS_W = 700;
const CANVAS_H = 500;
const TILE = 88;

const STATUS_COLORS: Record<TableStatus, { bg: string; ring: string; label: string }> = {
  AVAILABLE: { bg: "rgba(34,197,94,0.15)",  ring: "#22c55e", label: "Libre" },
  OCCUPIED:  { bg: "rgba(239,68,68,0.18)",  ring: "#ef4444", label: "Ocupada" },
  DIRTY:     { bg: "rgba(245,158,11,0.18)", ring: "#f59e0b", label: "Sucia" },
};

export default function TablesFloorPlan({
  open, mode = "manage", onClose, onPick, accent,
}: Props) {
  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false); // hay cambios de layout sin guardar
  const [saving, setSaving] = useState(false);
  // Tick para forzar re-render cada minuto y refrescar los colores por
  // tiempo. No re-fetchea, sólo recalcula los buckets en cliente.
  const [, setNowTick] = useState(0);

  // Drag state
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Add table form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newZoneId, setNewZoneId] = useState<string>("");

  // Rename inline
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Zonas configurables del local (para asignar a cada mesa).
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonePickerId, setZonePickerId] = useState<string | null>(null);

  async function fetchAll() {
    try {
      setLoading(true);
      const [tablesRes, zonesRes] = await Promise.all([
        api.get<TableRow[]>("/api/tables"),
        api.get<Zone[]>("/api/zones").catch(() => ({ data: [] as Zone[] })),
      ]);
      setTables(tablesRes.data);
      setZones(zonesRes.data || []);
      setError("");
    } catch (e: any) {
      setError(e?.response?.data?.error || "No se pudo cargar las mesas");
    } finally {
      setLoading(false);
    }
  }

  async function assignZone(tableId: string, zoneId: string | null) {
    try {
      const { data } = await api.patch<TableRow>(`/api/tables/${tableId}`, { zoneId });
      setTables(prev => prev.map(t => (t.id === tableId ? { ...t, zoneId: data.zoneId, zone: data.zone } : t)));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al asignar zona");
    } finally {
      setZonePickerId(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect
    // tanto del fetchAll() como de los resets de editing/dirty.
    queueMicrotask(() => {
      if (cancelled) return;
      fetchAll();
      setEditing(false);
      setDirty(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  // Refresca los colores de tiempo cada 60s mientras el modal está abierto.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNowTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [open]);

  if (!open) return null;

  // ── Drag handlers ────────────────────────────────────────────────────────
  function startDrag(e: React.PointerEvent, table: TableRow) {
    if (!editing || mode === "pick") return;
    e.preventDefault();
    const box = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    dragOffset.current = {
      dx: e.clientX - box.left,
      dy: e.clientY - box.top,
    };
    setDragId(table.id);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
  }

  function onDrag(e: React.PointerEvent) {
    if (!dragId || !canvasRef.current) return;
    const canvas = canvasRef.current.getBoundingClientRect();
    let nx = e.clientX - canvas.left - dragOffset.current.dx;
    let ny = e.clientY - canvas.top - dragOffset.current.dy;
    nx = Math.max(0, Math.min(CANVAS_W - TILE, nx));
    ny = Math.max(0, Math.min(CANVAS_H - TILE, ny));
    setTables(prev => prev.map(t => (t.id === dragId ? { ...t, x: nx, y: ny } : t)));
    setDirty(true);
  }

  function endDrag(e: React.PointerEvent) {
    if (dragId) {
      try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId); } catch {}
    }
    setDragId(null);
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  async function saveLayout() {
    setSaving(true);
    try {
      await api.post("/api/tables/bulk-positions", {
        positions: tables.map(t => ({ id: t.id, x: t.x, y: t.y })),
      });
      setDirty(false);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al guardar layout");
    } finally {
      setSaving(false);
    }
  }

  async function addTable() {
    if (!newName.trim()) return;
    try {
      const { data } = await api.post<TableRow>("/api/tables", {
        name: newName.trim(),
        x: 20, y: 20,
        zoneId: newZoneId || null,
      });
      setTables(prev => [...prev, data]);
      setNewName("");
      setNewZoneId("");
      setShowAdd(false);
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al crear mesa");
    }
  }

  async function commitRename(id: string) {
    const value = renameValue.trim();
    if (!value) { setRenameId(null); return; }
    try {
      const { data } = await api.patch<TableRow>(`/api/tables/${id}`, { name: value });
      setTables(prev => prev.map(t => (t.id === id ? { ...t, name: data.name } : t)));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al renombrar");
    } finally {
      setRenameId(null);
    }
  }

  async function deleteTable(t: TableRow) {
    if (!confirm(`¿Eliminar mesa "${t.name}"?`)) return;
    try {
      await api.delete(`/api/tables/${t.id}`);
      setTables(prev => prev.filter(x => x.id !== t.id));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al eliminar");
    }
  }

  async function clearTable(t: TableRow) {
    try {
      const { data } = await api.post<TableRow>(`/api/tables/${t.id}/clear`);
      setTables(prev => prev.map(x => (x.id === t.id ? { ...x, status: data.status } : x)));
    } catch (e: any) {
      alert(e?.response?.data?.error || "Error al marcar limpia");
    }
  }

  function handleTileClick(t: TableRow) {
    if (mode === "pick") {
      if (t.status !== "AVAILABLE") return;
      onPick?.(t);
      return;
    }
    // En manage, click sin estar editando: si está dirty mostrar "Marcar limpia"
    if (!editing && t.status === "DIRTY") {
      if (confirm(`¿Marcar "${t.name}" como limpia y disponible?`)) clearTable(t);
    }
  }

  const counts = {
    available: tables.filter(t => t.status === "AVAILABLE").length,
    occupied:  tables.filter(t => t.status === "OCCUPIED").length,
    dirty:     tables.filter(t => t.status === "DIRTY").length,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl border overflow-hidden"
        style={{ background: "var(--surf)", borderColor: "var(--border)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <div>
            <h2 className="text-lg font-black text-white">
              {mode === "pick" ? "🪑 Selecciona una mesa" : "🪑 Mesas"}
            </h2>
            <p className="text-[11px] font-bold mt-0.5" style={{ color: "var(--muted)" }}>
              {counts.available} libres · {counts.occupied} ocupadas · {counts.dirty} sucias
            </p>
          </div>
          <div className="flex items-center gap-2">
            {mode === "manage" && (
              <button
                onClick={() => setEditing(v => !v)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{
                  background: editing ? accent : "var(--surf2)",
                  color: editing ? "#000" : "var(--text)",
                  border: "1px solid var(--border)",
                }}
              >
                {editing ? "✓ Editando" : "✎ Editar layout"}
              </button>
            )}
            <button onClick={onClose} className="text-2xl leading-none px-1" style={{ color: "var(--muted)" }} aria-label="Cerrar">✕</button>
          </div>
        </div>

        {/* Body: canvas */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 flex items-start justify-center" style={{ background: "var(--bg)" }}>
          {loading && <div className="p-8 text-sm" style={{ color: "var(--muted)" }}>Cargando…</div>}
          {!loading && error && (
            <div className="m-4 p-4 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20">{error}</div>
          )}
          {!loading && !error && (
            <div
              ref={canvasRef}
              className="relative rounded-xl border-2 border-dashed"
              style={{
                width: CANVAS_W,
                height: CANVAS_H,
                borderColor: editing ? accent : "var(--border)",
                background: "rgba(255,255,255,0.02)",
                backgroundImage:
                  editing
                    ? "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)"
                    : "none",
                backgroundSize: "20px 20px",
              }}
            >
              {tables.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-center" style={{ color: "var(--muted)" }}>
                  <div>
                    <p className="text-5xl mb-3">🪑</p>
                    <p className="text-sm">No hay mesas. Activa &quot;Editar layout&quot; y agrega la primera.</p>
                  </div>
                </div>
              )}

              {tables.map(t => {
                const sty = STATUS_COLORS[t.status];
                const selectable =
                  mode === "pick" ? t.status === "AVAILABLE" : true;
                // Mesa OCCUPIED → coloreamos por tiempo abierto. El borde
                // de la tarjeta y el badge "Ocupada" pasan al color del
                // bucket (verde 0-30m, amarillo 30-60m, naranja 60-90m,
                // morado 90+m). Para AVAILABLE/DIRTY conservamos el ring
                // del estado.
                const minutesOpen = t.status === "OCCUPIED" && t.activeOrder
                  ? Math.floor(minutesSince(t.activeOrder.createdAt))
                  : null;
                const timeBucket = minutesOpen != null ? bucketForMinutes(minutesOpen) : null;
                const ring = timeBucket?.color ?? sty.ring;
                return (
                  <div
                    key={t.id}
                    onPointerDown={e => editing && startDrag(e, t)}
                    onPointerMove={onDrag}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onClick={() => !editing && handleTileClick(t)}
                    className="absolute rounded-2xl flex flex-col items-center justify-center text-center select-none transition-all table-tile"
                    style={{
                      left: t.x,
                      top: t.y,
                      width: TILE,
                      height: TILE,
                      background: `linear-gradient(145deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04)), ${sty.bg}`,
                      border: `2px solid ${ring}`,
                      cursor: editing ? "grab" : selectable ? "pointer" : "not-allowed",
                      opacity: selectable ? 1 : 0.55,
                      boxShadow: dragId === t.id ? `0 18px 44px ${ring}66` : `0 14px 30px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.14)`,
                      touchAction: editing ? "none" : "auto",
                      backdropFilter: "blur(14px)",
                    }}
                    title={
                      mode === "pick" && !selectable
                        ? `${t.name} no disponible (${sty.label})`
                        : minutesOpen != null
                          ? `${t.name} · ${minutesOpen}m abierta`
                          : t.name
                    }
                  >
                    {renameId === t.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onBlur={() => commitRename(t.id)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitRename(t.id);
                          if (e.key === "Escape") setRenameId(null);
                        }}
                        className="w-[80%] bg-black/40 text-white text-xs text-center rounded outline-none px-1 py-0.5 border"
                        style={{ borderColor: ring }}
                      />
                    ) : (
                      <>
                        <span className="table-glyph mb-1" aria-hidden="true" />
                        <div className="font-black text-sm text-white">{t.name}</div>
                        <div className="text-[10px] font-bold mt-0.5" style={{ color: ring }}>
                          {minutesOpen != null ? `${minutesOpen}m abierta` : sty.label}
                        </div>
                        {t.activeOrder && t.status === "OCCUPIED" && (
                          <div className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.7)" }}>
                            ${Number(t.activeOrder.total).toFixed(0)} · {t.activeOrder._count?.items || 0} ít
                          </div>
                        )}
                      </>
                    )}

                    {editing && mode === "manage" && renameId !== t.id && (
                      <div
                        className="absolute -top-2 -right-2 flex gap-1"
                        onPointerDown={e => e.stopPropagation()}
                      >
                        <button
                          onClick={ev => {
                            ev.stopPropagation();
                            setZonePickerId(zonePickerId === t.id ? null : t.id);
                          }}
                          className="w-6 h-6 rounded-full text-[10px] font-bold bg-amber-500 text-black shadow"
                          title="Asignar zona"
                        >
                          🏷
                        </button>
                        <button
                          onClick={ev => {
                            ev.stopPropagation();
                            setRenameId(t.id);
                            setRenameValue(t.name);
                          }}
                          className="w-6 h-6 rounded-full text-[10px] font-bold bg-blue-500 text-white shadow"
                          title="Renombrar"
                        >
                          ✎
                        </button>
                        <button
                          onClick={ev => { ev.stopPropagation(); deleteTable(t); }}
                          className="w-6 h-6 rounded-full text-[10px] font-bold bg-red-500 text-white shadow"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    )}

                    {/* Badge de zona en la esquina inferior izquierda */}
                    {t.zone && (
                      <div
                        className="absolute -bottom-1.5 -left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold flex items-center gap-1 shadow"
                        style={{ background: "rgba(0,0,0,0.7)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)" }}
                      >
                        <span>{t.zone.icon || "📍"}</span>
                        <span className="max-w-[60px] truncate">{t.zone.name}</span>
                      </div>
                    )}

                    {/* Popover selector de zona */}
                    {zonePickerId === t.id && editing && (
                      <div
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-30 rounded-xl shadow-2xl border min-w-[180px] py-1"
                        style={{ background: "var(--surf)", borderColor: "var(--border)" }}
                        onClick={ev => ev.stopPropagation()}
                        onPointerDown={ev => ev.stopPropagation()}
                      >
                        <button
                          onClick={() => assignZone(t.id, null)}
                          className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/5"
                          style={{ color: !t.zoneId ? accent : "var(--muted)" }}
                        >
                          — Sin zona
                        </button>
                        {zones.length === 0 && (
                          <div className="px-3 py-2 text-[10px]" style={{ color: "var(--muted)" }}>
                            Crea zonas en Configuración → 🏷️ Zonas
                          </div>
                        )}
                        {zones.map(z => (
                          <button
                            key={z.id}
                            onClick={() => assignZone(t.id, z.id)}
                            className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/5 flex items-center gap-2"
                            style={{ color: t.zoneId === z.id ? accent : "var(--text)" }}
                          >
                            <span>{z.icon || "📍"}</span>
                            <span className="truncate">{z.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t flex items-center justify-between gap-2 flex-wrap"
          style={{ borderColor: "var(--border)", background: "var(--surf)" }}
        >
          {mode === "manage" && editing ? (
            <>
              {showAdd ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    placeholder="Nombre (ej. Mesa 5)"
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                    autoFocus
                  />
                  <select
                    value={newZoneId}
                    onChange={e => setNewZoneId(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
                  >
                    <option value="">— Sin zona</option>
                    {zones.map(z => (
                      <option key={z.id} value={z.id}>
                        {z.icon ? `${z.icon} ` : ""}{z.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addTable}
                    className="px-3 py-2 rounded-lg text-xs font-black uppercase"
                    style={{ background: accent, color: "#000" }}
                  >
                    Agregar
                  </button>
                  <button
                    onClick={() => { setShowAdd(false); setNewName(""); setNewZoneId(""); }}
                    className="px-3 py-2 rounded-lg text-xs font-bold"
                    style={{ color: "var(--muted)" }}
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAdd(true)}
                  className="px-3 py-2 rounded-lg text-xs font-bold"
                  style={{ background: "var(--surf2)", color: "var(--text)", border: "1px solid var(--border)" }}
                >
                  + Nueva mesa
                </button>
              )}
              <button
                onClick={saveLayout}
                disabled={!dirty || saving}
                className="px-4 py-2 rounded-lg text-xs font-black uppercase disabled:opacity-40"
                style={{ background: accent, color: "#000" }}
              >
                {saving ? "Guardando…" : dirty ? "Guardar layout" : "Sin cambios"}
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                {mode === "pick"
                  ? "Toca una mesa libre para iniciar la cuenta."
                  : "Toca una mesa sucia para marcarla como limpia. Activa 'Editar layout' para mover/agregar/borrar."}
              </span>
              {/* Leyenda de buckets de tiempo — visible cuando hay mesas
                  ocupadas para que el gerente entienda los colores. */}
              {tables.some((t) => t.status === "OCCUPIED") && (
                <div className="flex items-center gap-2 ml-auto">
                  {TIME_BUCKETS.map((b) => (
                    <span
                      key={b.label}
                      className="flex items-center gap-1 text-[10px] font-bold"
                      style={{ color: b.color }}
                    >
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: b.color }}
                      />
                      {b.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
