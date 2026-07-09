"use client";
import { Bot, X } from "lucide-react";
import { Modal, Button, IconBadge } from "@/components/ds";
import { cellCls, cellStyle, type LookupIngredient, type ScanRow } from "./shared";

// Revisión del ticket escaneado con IA: asocia cada renglón detectado a un
// ingrediente existente antes de volcarlo a las líneas de compra.
export function ScanReviewModal({
  open,
  rows,
  setRows,
  ingredients,
  onCancel,
  onApply,
}: {
  open: boolean;
  rows: ScanRow[];
  setRows: React.Dispatch<React.SetStateAction<ScanRow[]>>;
  ingredients: LookupIngredient[];
  onCancel: () => void;
  onApply: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="lg"
      title="Revisión de ticket"
      subtitle="Asocia cada renglón a un ingrediente existente"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onApply} disabled={rows.length === 0}>Agregar a la compra</Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <IconBadge icon={Bot} tone="ac" size={40} />
        <p className="font-mono text-[10px] uppercase tracking-wider text-tx-mut">
          Asocia cada renglón a un ingrediente existente
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-tx-mut">Sin renglones detectados.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r, idx) => (
            <div key={idx} className="grid items-center gap-2 rounded-ds-md p-2"
              style={{ background: "var(--surf-2)", gridTemplateColumns: "1fr 1fr 70px 80px 36px" }}>
              <span className="truncate text-xs text-tx-mut" title={r.name || "—"}>{r.name || "—"}</span>
              <select value={r.matchedId}
                onChange={e => setRows(p => p.map((x, i) => i === idx ? { ...x, matchedId: e.target.value } : x))}
                className={cellCls} style={cellStyle}>
                <option value="">— omitir —</option>
                {ingredients.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="number" step="0.001" min="0" value={r.quantityFound}
                onChange={e => setRows(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                className={`${cellCls} tabular-nums`} style={cellStyle} />
              <input type="number" step="0.01" min="0" value={r.totalCost}
                onChange={e => setRows(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                className={`${cellCls} tabular-nums`} style={cellStyle} />
              <button onClick={() => setRows(p => p.filter((_, i) => i !== idx))} aria-label="Quitar"
                className="grid h-9 w-9 place-items-center rounded-lg"
                style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                <X size={14} strokeWidth={2.4} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
