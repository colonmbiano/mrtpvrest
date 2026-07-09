"use client";
import { Drawer, Button, Field, Input, Select, Toggle } from "@/components/ds";
import { UNITS, type FormState, type Supplier, type IngredientType, type IngredientCategory } from "./shared";

// Alta / edición de insumo. Formulario largo → Drawer lateral.
export function IngredientFormModal({
  open,
  isEditing,
  form, setForm,
  suppliers,
  types,
  categories,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  isEditing: boolean;
  form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>;
  suppliers: Supplier[];
  types: IngredientType[];
  categories: IngredientCategory[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${isEditing ? "Editar" : "Nuevo"} insumo`}
      width={520}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={() => onSubmit({ preventDefault() {} } as React.FormEvent)} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Nombre */}
        <Field label="Nombre del insumo" required>
          <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required
            placeholder="Ej. Tomate, Pollo, Harina" />
        </Field>

        {/* Compra */}
        <div className="space-y-3 rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Unidad de compra</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Presentación">
              <Input value={form.purchaseUnit} onChange={e => setForm(p => ({ ...p, purchaseUnit: e.target.value }))}
                placeholder="Caja, Costal, Bolsa" />
            </Field>
            <Field label="Costo de compra ($)">
              <Input type="number" step="0.01" min="0" value={form.purchaseCost}
                onChange={e => setForm(p => ({ ...p, purchaseCost: e.target.value }))}
                placeholder="600" />
            </Field>
          </div>
          <Field label="Rendimiento (cantidad que incluye)">
            <Input type="number" step="0.001" min="1" value={form.conversionFactor}
              onChange={e => setForm(p => ({ ...p, conversionFactor: e.target.value }))}
              placeholder="40" />
          </Field>
        </div>

        {/* Receta */}
        <div className="space-y-3 rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Unidad de receta</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidad de uso">
              <Select value={form.unit} onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </Select>
            </Field>
            <Field label="Costo unitario manual ($)">
              <Input type="number" step="0.0001" min="0" value={form.cost}
                onChange={e => setForm(p => ({ ...p, cost: e.target.value }))}
                disabled={form.purchaseCost !== ""}
                placeholder={form.purchaseCost !== "" ? "Automático" : "15"} />
            </Field>
          </div>

          {/* Costo calculado */}
          {form.purchaseCost !== "" && Number(form.conversionFactor) > 0 && (
            <div className="rounded-ds-md px-4 py-3" style={{ background: "var(--accent-soft)" }}>
              <p className="text-xs font-bold text-primary">
                Costo unitario calculado:{" "}
                <span className="font-mono text-tx-hi">
                  ${(Number(form.purchaseCost) / Number(form.conversionFactor)).toFixed(4)}
                </span>{" "}
                por <span className="font-bold text-tx-hi">{form.unit}</span>
              </p>
            </div>
          )}
        </div>

        {/* Stock */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stock actual">
            <Input type="number" step="0.01" min="0" value={form.stock}
              onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} />
          </Field>
          <Field label="Stock mínimo">
            <Input type="number" step="0.01" min="0" value={form.minStock}
              onChange={e => setForm(p => ({ ...p, minStock: e.target.value }))} />
          </Field>
        </div>

        {/* Proveedor */}
        <Field label="Proveedor">
          <Select value={form.supplierId} onChange={e => setForm(p => ({ ...p, supplierId: e.target.value }))}>
            <option value="">Sin proveedor</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>

        {/* Taxonomía: Tipo + Categoría + Unidad base */}
        <div className="space-y-3 rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Clasificación para costeo</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipo / Estación">
              <Select value={form.typeId} onChange={e => setForm(p => ({ ...p, typeId: e.target.value }))}>
                <option value="">— sin tipo —</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <Field label="Categoría">
              <Select value={form.categoryId} onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}>
                <option value="">— sin categoría —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Unidad base (normalizada)" hint="Las recetas y stock se normalizan a esta unidad internamente (Kg → 1000g, L → 1000ml).">
            <Select value={form.baseUnit} onChange={e => setForm(p => ({ ...p, baseUnit: e.target.value as FormState["baseUnit"] }))}>
              <option value="GRAM">Gramos (peso)</option>
              <option value="ML">Mililitros (volumen)</option>
              <option value="PIECE">Piezas (conteo)</option>
            </Select>
          </Field>
        </div>

        {/* Factor de corrección (peso bruto vs neto) */}
        <div className="space-y-3 rounded-ds-lg p-4" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">Factor de corrección</p>
            {form.pesoBruto !== "" && form.pesoNeto !== "" && Number(form.pesoNeto) > 0 && (
              <p className="font-mono text-[10px] font-bold tabular-nums text-primary">
                = {(Number(form.pesoBruto) / Number(form.pesoNeto)).toFixed(3)}x
              </p>
            )}
          </div>
          <p className="-mt-1 text-[10px] text-tx-mut">
            Merma al limpiar / pelar / desemilar antes de usar en receta.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso bruto">
              <Input type="number" step="0.01" min="0" value={form.pesoBruto}
                onChange={e => setForm(p => ({ ...p, pesoBruto: e.target.value }))}
                placeholder="1000" />
            </Field>
            <Field label="Peso neto utilizable">
              <Input type="number" step="0.01" min="0" value={form.pesoNeto}
                onChange={e => setForm(p => ({ ...p, pesoNeto: e.target.value }))}
                placeholder="950" />
            </Field>
          </div>
        </div>

        {/* Packaging flag */}
        <div className="flex items-center justify-between gap-3 rounded-ds-md p-3" style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
          <div>
            <p className="text-sm font-bold text-tx">Es empaque / desechable</p>
            <p className="text-[10px] text-tx-mut">Charolas, vasos térmicos, bolsas — costea delivery por orden.</p>
          </div>
          <Toggle checked={form.isPackaging} onChange={(n) => setForm(p => ({ ...p, isPackaging: n }))} label="Es empaque / desechable" />
        </div>
      </form>
    </Drawer>
  );
}
