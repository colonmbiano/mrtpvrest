"use client";
import { useCallback, useEffect, useState } from "react";
import { Plus, Repeat, Pencil, Trash2, Power, CalendarDays } from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Toolbar, Card, Button, IconButton,
  EmptyState, Skeleton, Pill, IconBadge, Modal, Field, Input, Select,
  useToast, useConfirm,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

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
const mny = (n: number) => formatMoney(n, false);
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", year: "numeric" });

type Form = {
  id?: string; concept: string; amount: string; frequency: string;
  dayOfMonth: string; nextDueAt: string; categoryId: string; supplierId: string; isActive: boolean;
};
const EMPTY: Form = { concept: "", amount: "", frequency: "MONTHLY", dayOfMonth: "1", nextDueAt: "", categoryId: "", supplierId: "", isActive: true };

export default function RecurrentesPage() {
  const toast = useToast();
  const confirm = useConfirm();
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
      toast.error("Concepto, monto y próxima fecha son obligatorios.");
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
      toast.error(err.response?.data?.error || "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: Recurring) {
    await api.patch(`/api/payables/recurring/${r.id}`, { isActive: !r.isActive }).catch(() => {});
    load();
  }
  async function remove(r: Recurring) {
    if (!(await confirm({ title: `¿Eliminar la plantilla "${r.concept}"?`, body: "Se eliminará la plantilla de gasto recurrente.", danger: true, confirmLabel: "Eliminar" }))) return;
    await api.delete(`/api/payables/recurring/${r.id}`).catch(() => {});
    load();
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Finanzas · Recurrentes"
        title="Gastos recurrentes"
        subtitle="Plantillas que generan cuentas por pagar cada periodo"
      />
      <PageTabs set="finanzas" />

      <Toolbar actions={<Button icon={Plus} onClick={openNew}>Nuevo recurrente</Button>} />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-ds-lg" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={Repeat} title="Sin gastos recurrentes"
          hint="Crea plantillas para renta, luz, sueldos… y se generarán solas como cuentas por pagar."
          action={<Button icon={Plus} onClick={openNew}>Nuevo recurrente</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map((r) => (
            <Card key={r.id} className="p-4" style={r.isActive ? undefined : { opacity: 0.6 }}>
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
                <span className="shrink-0 font-mono text-base font-extrabold tabular-nums text-tx-hi">{mny(r.amount)}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" icon={Power} full onClick={() => toggle(r)}>
                  {r.isActive ? "Pausar" : "Activar"}
                </Button>
                <IconButton icon={Pencil} label="Editar" size={40} onClick={() => openEdit(r)} />
                <IconButton icon={Trash2} label="Eliminar" size={40} danger onClick={() => remove(r)} />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ── Modal crear/editar ───────────────────────────────────────────── */}
      {form && (
        <Modal
          open
          onClose={() => setForm(null)}
          size="sm"
          title={`${form.id ? "Editar" : "Nuevo"} recurrente`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>Cancelar</Button>
              <Button type="button" loading={saving} onClick={save}>{saving ? "Guardando…" : "Guardar"}</Button>
            </>
          }
        >
          <Field label="Concepto">
            <Input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Renta del local" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monto">
              <Input type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
            <Field label="Frecuencia">
              <Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
                <option value="MONTHLY">Mensual</option><option value="BIWEEKLY">Quincenal</option><option value="WEEKLY">Semanal</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Próxima fecha">
              <Input type="date" value={form.nextDueAt} onChange={(e) => setForm({ ...form, nextDueAt: e.target.value })} />
            </Field>
            {form.frequency === "MONTHLY" && (
              <Field label="Día del mes (1-28)">
                <Input type="number" min="1" max="28" value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: e.target.value })} />
              </Field>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Categoría">
              <Select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— sin categoría —</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Proveedor">
              <Select value={form.supplierId} onChange={(e) => setForm({ ...form, supplierId: e.target.value })}>
                <option value="">— sin proveedor —</option>
                {sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
