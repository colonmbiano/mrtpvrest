"use client";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, Plus, Repeat, Pencil, Trash2, X, Power, CalendarDays } from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, EmptyState, Pill, IconBadge, money,
} from "@/components/warmtech";

// /admin/inventario/recurrentes · Plantillas de gasto recurrente (renta, luz,
// sueldos). Generan una cuenta por pagar (PENDIENTE) cada periodo.

interface Recurring {
  id: string; concept: string; amount: number; frequency: string;
  dayOfMonth: number | null; nextDueAt: string; isActive: boolean;
  categoryId: string | null; supplierId: string | null;
}
interface Cat { id: string; name: string }
interface Sup { id: string; name: string }

const FREQ_LABEL: Record<string, string> = { MONTHLY: "Mensual", BIWEEKLY: "Quincenal", WEEKLY: "Semanal" };
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });

type Form = {
  id?: string; concept: string; amount: string; frequency: string;
  dayOfMonth: string; nextDueAt: string; categoryId: string; supplierId: string; isActive: boolean;
};
const EMPTY: Form = { concept: "", amount: "", frequency: "MONTHLY", dayOfMonth: "1", nextDueAt: "", categoryId: "", supplierId: "", isActive: true };

export default function RecurrentesPage() {
  const [list, setList] = useState<Recurring[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [sups, setSups] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, s] = await Promise.all([
        api.get<Recurring[]>("/api/payables/recurring"),
        api.get<Cat[]>("/api/expenses/categories").catch(() => ({ data: [] as Cat[] })),
        api.get<Sup[]>("/api/purchases/lookup/suppliers").catch(() => ({ data: [] as Sup[] })),
      ]);
      setList(r.data || []);
      setCats(c.data || []);
      setSups(s.data || []);
    } catch {
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openNew() {
    const d = new Date(); d.setMonth(d.getMonth() + 1, 1);
    setForm({ ...EMPTY, nextDueAt: d.toISOString().slice(0, 10) });
  }
  function openEdit(r: Recurring) {
    setForm({
      id: r.id, concept: r.concept, amount: String(r.amount), frequency: r.frequency,
      dayOfMonth: r.dayOfMonth != null ? String(r.dayOfMonth) : "", nextDueAt: r.nextDueAt.slice(0, 10),
      categoryId: r.categoryId || "", supplierId: r.supplierId || "", isActive: r.isActive,
    });
  }

  async function save() {
    if (!form) return;
    if (!form.concept.trim() || !(Number(form.amount) > 0) || !form.nextDueAt) {
      alert("Concepto, monto y próxima fecha son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        concept: form.concept.trim(),
        amount: Number(form.amount),
        frequency: form.frequency,
        dayOfMonth: form.frequency === "MONTHLY" && form.dayOfMonth ? Number(form.dayOfMonth) : null,
        nextDueAt: form.nextDueAt,
        categoryId: form.categoryId || null,
        supplierId: form.supplierId || null,
        isActive: form.isActive,
      };
      if (form.id) await api.patch(`/api/payables/recurring/${form.id}`, payload);
      else await api.post("/api/payables/recurring", payload);
      setForm(null);
      await load();
    } catch (e) {
      const err = e as { response?: { data?: { error?: string } } };
      alert(err.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: Recurring) {
    await api.patch(`/api/payables/recurring/${r.id}`, { isActive: !r.isActive }).catch(() => {});
    load();
  }
  async function remove(r: Recurring) {
    if (!confirm(`¿Eliminar la plantilla "${r.concept}"?`)) return;
    await api.delete(`/api/payables/recurring/${r.id}`).catch(() => {});
    load();
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Finanzas · Inventario"
        title="Gastos recurrentes"
        subtitle="Plantillas que generan cuentas por pagar cada periodo"
        actions={<PrimaryBtn full={false} icon={Plus} onClick={openNew}>Nuevo recurrente</PrimaryBtn>}
      />
      <div className="mb-4 md:hidden flex items-center justify-between">
        <a href="/admin/inventario/por-pagar" className="inline-flex min-h-9 items-center gap-1 text-xs font-bold text-tx-mut">
          <ChevronLeft size={15} /> Cuentas por pagar
        </a>
        <PrimaryBtn full={false} icon={Plus} onClick={openNew}>Nuevo</PrimaryBtn>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-[18px] bg-surf-2" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Repeat} title="Sin gastos recurrentes"
          hint="Crea plantillas para renta, luz, sueldos… y se generarán solas como cuentas por pagar."
          action={<PrimaryBtn full={false} icon={Plus} onClick={openNew}>Nuevo recurrente</PrimaryBtn>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((r) => (
            <WtCard key={r.id} className="p-4" style={r.isActive ? undefined : { opacity: 0.6 }}>
              <div className="flex items-start gap-3">
                <IconBadge icon={CalendarDays} tone={r.isActive ? "ac" : "neutral"} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-extrabold text-tx-hi">{r.concept}</span>
                    {!r.isActive && <Pill tone="neutral">Pausado</Pill>}
                  </div>
                  <div className="mt-0.5 text-[11px] text-tx-mut">
                    {FREQ_LABEL[r.frequency] || r.frequency} · próxima {fmtDay(r.nextDueAt)}
                  </div>
                </div>
                <span className="shrink-0 font-mono text-base font-extrabold tabular-nums text-tx-hi">{money(r.amount)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => toggle(r)} className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx-mid" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                  <Power size={14} /> {r.isActive ? "Pausar" : "Activar"}
                </button>
                <button type="button" onClick={() => openEdit(r)} aria-label="Editar" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-tx-mid" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
                  <Pencil size={15} />
                </button>
                <button type="button" onClick={() => remove(r)} aria-label="Eliminar" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </WtCard>
          ))}
        </div>
      )}

      {/* ── Modal crear/editar ───────────────────────────────────────────── */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,.78)" }}>
          <WtCard className="my-4 w-full max-w-md p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-tx-hi">{form.id ? "Editar" : "Nuevo"} recurrente</h2>
              <button onClick={() => setForm(null)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-2)" }}><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <F label="Concepto">
                <input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Renta del local"
                  className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp} />
              </F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Monto"><input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp} /></F>
                <F label="Frecuencia">
                  <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp}>
                    <option value="MONTHLY">Mensual</option><option value="BIWEEKLY">Quincenal</option><option value="WEEKLY">Semanal</option>
                  </select>
                </F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Próxima fecha"><input type="date" value={form.nextDueAt} onChange={(e) => setForm({ ...form, nextDueAt: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp} /></F>
                {form.frequency === "MONTHLY" && (
                  <F label="Día del mes (1-28)"><input type="number" min="1" max="28" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp} /></F>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Categoría">
                  <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp}>
                    <option value="">— sin categoría —</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </F>
                <F label="Proveedor">
                  <select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={inp}>
                    <option value="">— sin proveedor —</option>
                    {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </F>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <PrimaryBtn ghost onClick={() => setForm(null)}>Cancelar</PrimaryBtn>
              <PrimaryBtn type="button" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar"}</PrimaryBtn>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}

const inp: React.CSSProperties = { background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" };
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 ml-1 block font-mono text-[9.5px] font-bold uppercase tracking-[.12em] text-tx-mut">{label}</label>
      {children}
    </div>
  );
}
