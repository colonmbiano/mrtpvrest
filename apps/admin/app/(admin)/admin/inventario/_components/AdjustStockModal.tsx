"use client";
import { Modal, Button, Segmented } from "@/components/ds";
import { unitOptionsFor, baseUnitLabel, toBaseQty, type Ingredient } from "./shared";

export function AdjustStockModal({
  ing,
  adjustType, setAdjustType,
  adjustQty, setAdjustQty,
  adjustUnit, setAdjustUnit,
  adjustReason, setAdjustReason,
  adjustSaving,
  onClose,
  onSubmit,
}: {
  ing: Ingredient;
  adjustType: string; setAdjustType: (v: string) => void;
  adjustQty: string; setAdjustQty: (v: string) => void;
  adjustUnit: string; setAdjustUnit: (v: string) => void;
  adjustReason: string; setAdjustReason: (v: string) => void;
  adjustSaving: boolean;
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ajustar stock"
      subtitle={`${ing.name} · actual ${ing.stock} ${baseUnitLabel(ing.baseUnit)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={() => onSubmit({ preventDefault() {} } as React.FormEvent)} loading={adjustSaving} disabled={adjustSaving || !adjustQty}>
            Registrar
          </Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <div className="mb-2 font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Tipo de movimiento</div>
          <Segmented
            value={adjustType}
            onChange={setAdjustType}
            options={[
              { value: "IN", label: "Entrada" },
              { value: "OUT", label: "Salida" },
              { value: "ADJUST", label: "Conteo" },
            ] as const}
          />
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
            {adjustType === "ADJUST" ? "Stock real contado" : "Cantidad"}
          </label>
          <div className="flex gap-2">
            <input
              type="number" step="0.001" min="0" required autoFocus
              value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
              className="min-w-0 flex-1 rounded-ds-md px-4 py-2.5 text-sm outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            />
            <select
              value={adjustUnit} onChange={e => setAdjustUnit(e.target.value)}
              className="rounded-ds-md px-3 py-2.5 text-sm outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            >
              {unitOptionsFor(ing.baseUnit).map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
          {adjustQty && adjustUnit !== baseUnitLabel(ing.baseUnit) && (
            <p className="mt-1.5 text-[11px] text-tx-mut">
              = {toBaseQty(Number(adjustQty), adjustUnit, ing.baseUnit).toLocaleString("es-MX")} {baseUnitLabel(ing.baseUnit)}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">Motivo (opcional)</label>
          <input
            value={adjustReason} onChange={e => setAdjustReason(e.target.value)}
            placeholder="Ej. compra, merma, conteo físico"
            className="w-full rounded-ds-md px-4 py-2.5 text-sm outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
          />
        </div>
      </form>
    </Modal>
  );
}
