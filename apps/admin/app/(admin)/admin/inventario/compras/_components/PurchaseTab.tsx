"use client";
import { Bot, ScanLine, Plus, Trash2 } from "lucide-react";
import { Card, Button } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import {
  inputCls, inputStyle, cellCls, cellStyle, PAYMENT_METHODS,
  type LocationRow, type Supplier, type LookupIngredient, type PurchaseLine,
} from "./shared";

export function PurchaseTab({
  suppliers,
  locations,
  ingredients,
  centralEnabled,
  centralLoc,
  supplierId, setSupplierId,
  destLocationId, setDestLocationId,
  paymentMethod, setPaymentMethod,
  lines, updateLine, addLine, removeLine,
  purchaseNotes, setPurchaseNotes,
  purchaseTotal,
  savingPurchase, onSubmit,
  isScanning, onScan,
}: {
  suppliers: Supplier[];
  locations: LocationRow[];
  ingredients: LookupIngredient[];
  centralEnabled: boolean;
  centralLoc: LocationRow | null;
  supplierId: string; setSupplierId: (v: string) => void;
  destLocationId: string; setDestLocationId: (v: string) => void;
  paymentMethod: string; setPaymentMethod: (v: string) => void;
  lines: PurchaseLine[];
  updateLine: (idx: number, patch: Partial<PurchaseLine>) => void;
  addLine: () => void;
  removeLine: (idx: number) => void;
  purchaseNotes: string; setPurchaseNotes: (v: string) => void;
  purchaseTotal: number;
  savingPurchase: boolean; onSubmit: () => void;
  isScanning: boolean; onScan: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <Card className="p-4 md:p-6">
      <div className="mb-5 grid gap-4 md:grid-cols-3">
        <Field label="Proveedor">
          <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— selecciona —</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <Field label={`Destino${centralEnabled && centralLoc ? " (default: Bodega Central)" : ""}`}>
          <select value={destLocationId} onChange={e => setDestLocationId(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">— selecciona —</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}{l.isCentralWarehouse ? " · Bodega Central" : ""}</option>
            ))}
          </select>
        </Field>
        <Field label="Método de pago">
          <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={inputCls} style={inputStyle}>
            {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[.14em] text-primary">Líneas de compra</p>
        <label
          className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-xs font-bold ${isScanning ? "animate-pulse" : ""}`}
          style={{
            background: isScanning ? "var(--warn-soft)" : "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))",
            color: isScanning ? "var(--warn)" : "var(--accent-contrast)",
          }}
        >
          {isScanning ? <Bot size={15} /> : <ScanLine size={15} />}
          {isScanning ? "Procesando…" : "Escanear ticket (IA)"}
          {!isScanning && <input type="file" accept="image/*,application/pdf,.xlsx,.csv" multiple onChange={onScan} className="hidden" />}
        </label>
      </div>

      <div className="space-y-2">
        {lines.map((l, idx) => (
          <div key={idx} className="grid grid-cols-12 items-center gap-2">
            <select value={l.ingredientId} onChange={e => updateLine(idx, { ingredientId: e.target.value })}
              className={`${cellCls} col-span-12 sm:col-span-6`} style={cellStyle}>
              <option value="">— ingrediente —</option>
              {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <input type="number" step="0.001" min="0" placeholder="Cantidad" value={l.qty}
              onChange={e => updateLine(idx, { qty: e.target.value })}
              className={`${cellCls} col-span-6 tabular-nums sm:col-span-2`} style={cellStyle} />
            <input type="number" step="0.01" min="0" placeholder="$ unitario" value={l.unitPrice}
              onChange={e => updateLine(idx, { unitPrice: e.target.value })}
              className={`${cellCls} col-span-6 tabular-nums sm:col-span-2`} style={cellStyle} />
            <span className="col-span-8 text-right font-mono text-xs tabular-nums text-primary sm:col-span-1">
              {formatMoney((Number(l.qty) || 0) * (Number(l.unitPrice) || 0))}
            </span>
            <button onClick={() => removeLine(idx)} aria-label="Quitar línea"
              className="col-span-4 grid h-9 w-9 place-items-center justify-self-end rounded-lg sm:col-span-1"
              style={{ background: "var(--err-soft)", color: "var(--err)" }}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button onClick={addLine}
        className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3 text-xs font-bold text-tx"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        <Plus size={14} strokeWidth={2} /> Agregar línea
      </button>

      <textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)}
        placeholder="Notas (opcional)" rows={2}
        className="mt-4 w-full resize-none rounded-ds-md px-3 py-2.5 text-sm text-tx outline-none focus:border-primary"
        style={inputStyle} />

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--bd-1)" }}>
        <p className="text-sm font-bold text-tx">
          Total: <span className="font-display font-extrabold text-primary">{formatMoney(purchaseTotal)}</span>
        </p>
        <Button onClick={onSubmit} loading={savingPurchase}>Registrar compra</Button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">{label}</label>
      {children}
    </div>
  );
}
