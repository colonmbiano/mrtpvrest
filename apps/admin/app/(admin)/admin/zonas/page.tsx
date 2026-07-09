"use client";
// Zonas de entrega — editor de polígonos en el mapa con tarifa por zona.
//
// El dueño dibuja polígonos (toca el mapa para agregar vértices, los arrastra
// para ajustar) y le pone una tarifa a cada uno. En el checkout, la ubicación
// GPS del cliente decide la zona y su costo; fuera de todas = sin cobertura.
// El cálculo es server-side (lib/delivery-fee.js); aquí solo se administran.
// Requiere activar "Por zonas" en Ajustes de tienda (RestaurantConfig.deliveryMode).

import { useCallback, useEffect, useState } from "react";
import { MapPin, Plus, Trash2, Save, Undo2, Eraser, Truck } from "lucide-react";
import api from "@/lib/api";
import { PageShell, PageHeader, Card, Button, Pill, Toggle, EmptyState } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { DeliveryZoneMap } from "@/components/DeliveryZoneMap";

type LatLng = { lat: number; lng: number };
type Zone = {
  id: string;
  name: string;
  fee: number;
  color: string;
  polygon: LatLng[];
  active: boolean;
  priority: number;
};

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#0ea5e9"];

const EMPTY_FORM = { name: "", fee: 0, color: COLORS[0], active: true, priority: 0 };

const INPUT_CLS = "w-full rounded-xl px-3 py-2.5 text-sm outline-none";
const INPUT_STYLE = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" } as const;

export default function ZonasPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = useCallback((msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/api/delivery-zones");
      setZones(data.zones || []);
    } catch {
      /* interceptor reintenta */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setDraft([]);
  }

  function editZone(z: Zone) {
    setEditingId(z.id);
    setForm({ name: z.name, fee: z.fee, color: z.color, active: z.active, priority: z.priority });
    setDraft(Array.isArray(z.polygon) ? z.polygon : []);
  }

  async function save() {
    if (!form.name.trim()) return showToast("Ponle un nombre a la zona", false);
    if (draft.length < 3) return showToast("Dibuja la zona con al menos 3 puntos", false);
    setSaving(true);
    try {
      await api.post("/api/delivery-zones", {
        id: editingId || undefined,
        name: form.name.trim(),
        fee: form.fee,
        color: form.color,
        active: form.active,
        priority: form.priority,
        polygon: draft,
      });
      showToast(editingId ? "Zona actualizada" : "Zona creada");
      await load();
      startNew();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "No se pudo guardar la zona", false);
    } finally {
      setSaving(false);
    }
  }

  async function remove(z: Zone) {
    if (!confirm(`¿Eliminar la zona "${z.name}"?`)) return;
    try {
      await api.delete(`/api/delivery-zones/${z.id}`);
      if (editingId === z.id) startNew();
      showToast("Zona eliminada");
      await load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      showToast(err?.response?.data?.error || "No se pudo eliminar", false);
    }
  }

  // Zonas de contexto en el mapa: todas menos la que estoy editando.
  const otherZones = zones
    .filter((z) => z.id !== editingId)
    .map((z) => ({ polygon: z.polygon, color: z.color }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Envíos"
        title="Zonas de entrega"
        subtitle="Dibuja polígonos con su tarifa; el GPS del cliente decide la zona"
        actions={<Button icon={Plus} full={false} onClick={startNew}>Nueva zona</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {/* Columna izquierda: formulario + lista */}
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <MapPin size={16} className="text-primary" />
              <span className="font-display text-sm font-extrabold text-tx-hi">
                {editingId ? "Editar zona" : "Nueva zona"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Nombre</label>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Ej. Centro, Norte, Colonia Roma…"
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Tarifa de envío ($)</label>
                <input
                  type="number" min="0"
                  value={form.fee}
                  onChange={(e) => setForm((f) => ({ ...f, fee: parseFloat(e.target.value) || 0 }))}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Prioridad</label>
                <input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
                <p className="ml-1 mt-1 text-[10px] text-tx-dim">Menor gana si dos zonas se enciman</p>
              </div>
            </div>

            {/* Color */}
            <div className="mt-4">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">Color en el mapa</label>
              <div className="flex flex-wrap gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className="h-8 w-8 rounded-full transition-transform active:scale-90"
                    style={{
                      background: c,
                      outline: form.color === c ? "2px solid var(--tx)" : "2px solid transparent",
                      outlineOffset: 2,
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Activa */}
            <div className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <span className="text-sm font-semibold text-tx">Zona activa</span>
              <Toggle checked={form.active} onChange={(v: boolean) => setForm((f) => ({ ...f, active: v }))} />
            </div>

            <div className="mt-5 flex gap-3">
              {editingId && <Button variant="ghost" onClick={startNew}>Cancelar</Button>}
              <Button icon={Save} disabled={saving} onClick={save}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear zona"}
              </Button>
            </div>
          </Card>

          {/* Lista de zonas */}
          <Card className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <Truck size={15} className="text-tx-mid" />
              <span className="font-display text-sm font-extrabold text-tx-hi">Zonas configuradas</span>
              <span className="ml-auto text-[11px] text-tx-mut">{zones.length}</span>
            </div>
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-surf-2" />)}
              </div>
            ) : zones.length === 0 ? (
              <EmptyState icon={MapPin} title="Aún no hay zonas" hint="Dibuja tu primera zona en el mapa y guárdala." />
            ) : (
              <div className="flex flex-col gap-2">
                {zones.map((z) => (
                  <div
                    key={z.id}
                    className="flex items-center gap-3 rounded-xl p-3"
                    style={{
                      background: editingId === z.id ? "var(--iris-soft)" : "var(--surf-2)",
                      border: `1px solid ${editingId === z.id ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    }}
                  >
                    <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: z.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-display text-sm font-bold text-tx-hi">{z.name}</span>
                        {!z.active && <Pill tone="neutral">Inactiva</Pill>}
                      </div>
                      <span className="text-[11px] text-tx-mut">{formatMoney(z.fee)} · {z.polygon?.length || 0} puntos</span>
                    </div>
                    <button
                      type="button" onClick={() => editZone(z)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--brand-primary)" }}
                    >
                      Editar
                    </button>
                    <button
                      type="button" onClick={() => remove(z)} aria-label="Eliminar zona"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
                      style={{ background: "var(--err-soft)", color: "var(--err)" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Columna derecha: mapa */}
        <Card className="p-4">
          <DeliveryZoneMap
            value={draft}
            onChange={setDraft}
            otherZones={otherZones}
            color={form.color}
            height={420}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-tx-mut">
              Toca el mapa para agregar puntos · arrastra para ajustar · <span className="text-tx">{draft.length} punto{draft.length === 1 ? "" : "s"}</span>
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setDraft((d) => d.slice(0, -1))}
                disabled={draft.length === 0}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-tx-mut disabled:opacity-40"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
              >
                <Undo2 size={14} /> Deshacer punto
              </button>
              <button
                type="button"
                onClick={() => setDraft([])}
                disabled={draft.length === 0}
                className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-40"
                style={{ background: "var(--err-soft)", color: "var(--err)" }}
              >
                <Eraser size={14} /> Limpiar
              </button>
            </div>
          </div>
        </Card>
      </div>

      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg"
          style={{ background: toast.ok ? "var(--ok)" : "var(--err)" }}
        >
          {toast.msg}
        </div>
      )}
    </PageShell>
  );
}
