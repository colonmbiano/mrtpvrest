"use client";
import { Drawer, Field, Input, Toggle, Button } from "@/components/ds";
import { type Category, type FormState, PRESETS } from "./types";

export function BulkPromoDrawer({
  form,
  setForm,
  categories,
  saving,
  onSave,
  onClose,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  categories: Category[];
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const toggleCategory = (id: string) =>
    setForm({
      ...form,
      categoryIds: form.categoryIds.includes(id)
        ? form.categoryIds.filter((x) => x !== id)
        : [...form.categoryIds, id],
    });

  return (
    <Drawer
      open
      onClose={() => !saving && onClose()}
      title={form.id ? "Editar promo" : "Nueva promo NxM"}
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={() => !saving && onClose()}>
            Cancelar
          </Button>
          <Button onClick={onSave} loading={saving} disabled={saving}>
            {form.id ? "Guardar cambios" : "Crear promo"}
          </Button>
        </>
      }
    >
      {/* Nombre */}
      <Field label="Nombre">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="3x2 Alitas y Boneless"
        />
      </Field>

      {/* NxM */}
      <Field label="Mecánica (compra N, paga M)">
        <div className="mb-2 flex flex-wrap gap-2">
          {PRESETS.map((p) => {
            const active = form.buyQuantity === p.buy && form.payQuantity === p.pay;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => setForm({ ...form, buyQuantity: p.buy, payQuantity: p.pay })}
                className="rounded-full px-3 py-1.5 text-[13px] font-bold transition-transform active:scale-95"
                style={{
                  background: active ? "var(--brand-primary)" : "var(--surf-2)",
                  color: active ? "var(--accent-contrast)" : "var(--tx)",
                  border: "1px solid var(--bd-2)",
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="mb-1 block text-[11px] text-tx-dim">Compra (N)</span>
            <Input
              type="number"
              min={2}
              value={form.buyQuantity}
              onChange={(e) => setForm({ ...form, buyQuantity: Math.max(2, Number(e.target.value) || 2) })}
            />
          </div>
          <span className="mt-5 font-display text-lg font-extrabold text-tx-mut">x</span>
          <div className="flex-1">
            <span className="mb-1 block text-[11px] text-tx-dim">Paga (M)</span>
            <Input
              type="number"
              min={1}
              value={form.payQuantity}
              onChange={(e) => setForm({ ...form, payQuantity: Math.max(1, Number(e.target.value) || 1) })}
            />
          </div>
        </div>
      </Field>

      {/* Categorías elegibles */}
      <Field label="Categorías elegibles (suman juntas para el bloque)">
        <div className="flex flex-wrap gap-2">
          {categories.length === 0 ? (
            <span className="text-[12px] text-tx-mut">No hay categorías en el menú.</span>
          ) : (
            categories.map((c) => {
              const active = form.categoryIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCategory(c.id)}
                  className="rounded-full px-3 py-1.5 text-[13px] font-semibold transition-transform active:scale-95"
                  style={{
                    background: active ? "var(--brand-primary)" : "var(--surf-2)",
                    color: active ? "var(--accent-contrast)" : "var(--tx)",
                    border: `1px solid ${active ? "transparent" : "var(--bd-2)"}`,
                  }}
                >
                  {c.name}
                </button>
              );
            })
          )}
        </div>
      </Field>

      {/* Vigencia opcional */}
      <Field label="Vigencia (opcional)">
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          />
          <span className="text-tx-dim">→</span>
          <Input
            type="date"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
        </div>
      </Field>

      {/* Horario diario opcional */}
      <Field label="Horario del día (opcional) — fuera de este horario la promo no aplica">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="mb-1 block text-[11px] text-tx-dim">Desde</span>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            />
          </div>
          <span className="mt-5 text-tx-dim">→</span>
          <div className="flex-1">
            <span className="mb-1 block text-[11px] text-tx-dim">Hasta (ej. 21:00 = 9 pm)</span>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            />
          </div>
        </div>
      </Field>

      {/* Activa */}
      <div
        className="flex items-center justify-between rounded-ds-md px-3 py-3"
        style={{ background: "var(--surf-2)" }}
      >
        <span className="text-[13px] font-semibold text-tx">Promo activa</span>
        <Toggle checked={form.isActive} onChange={(next) => setForm({ ...form, isActive: next })} label="Promo activa" />
      </div>
    </Drawer>
  );
}
