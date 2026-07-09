"use client";
import { Sparkles, Trash2, Plus, Check } from "lucide-react";
import { Modal, Button, IconBadge } from "@/components/ds";
import { UNITS, type ScannedItem } from "./shared";

// Revisión del ticket escaneado con IA antes de confirmar el alta masiva
// (bulk-confirm). Se conserva la lógica y los payloads originales.
export function ScanReviewModal({
  open,
  scannedItems,
  setScannedItems,
  isSavingBulk,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  scannedItems: ScannedItem[];
  setScannedItems: React.Dispatch<React.SetStateAction<ScannedItem[]>>;
  isSavingBulk: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      size="lg"
      title="Revisión de ticket"
      subtitle="Verifica y corrige antes de guardar"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button icon={Check} loading={isSavingBulk} disabled={isSavingBulk || scannedItems.length === 0} onClick={onConfirm}>
            {`Confirmar ${scannedItems.length}`}
          </Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3">
        <IconBadge icon={Sparkles} tone="ac" size={40} />
        <p className="text-[11px] text-tx-mut">Verifica y corrige antes de guardar</p>
      </div>

      <div className="ds-scrollbar overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--bd-1)" }}>
              {["Ingrediente", "Costo total ($)", "Cantidad / rendimiento", "Unidad", "Costo unitario", ""].map(h => (
                <th key={h} className="px-3 py-2 text-left font-mono text-[10px] font-bold uppercase tracking-wider text-tx-dim">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scannedItems.map((item, idx) => {
              const cost = Number(item.totalCost) && Number(item.quantityFound)
                ? (Number(item.totalCost) / Number(item.quantityFound)).toFixed(4)
                : "—";
              return (
                <tr key={idx} style={{ borderBottom: "1px solid var(--bd-1)" }}>
                  <td className="px-3 py-2">
                    <input
                      value={item.name}
                      onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                      className="w-full rounded-lg px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" step="0.01" min="0"
                      value={item.totalCost}
                      onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, totalCost: e.target.value } : x))}
                      className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number" step="0.001" min="1"
                      value={item.quantityFound}
                      onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, quantityFound: e.target.value } : x))}
                      className="w-24 rounded-lg px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={item.unit}
                      onChange={e => setScannedItems(p => p.map((x, i) => i === idx ? { ...x, unit: e.target.value } : x))}
                      className="rounded-lg px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                    >
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="font-mono text-sm font-bold text-primary">${cost}</span>
                    <span className="ml-1 text-xs text-tx-dim">/{item.unit}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => setScannedItems(p => p.filter((_, i) => i !== idx))}
                      aria-label="Quitar fila"
                      className="grid h-8 w-8 place-items-center rounded-lg"
                      style={{ background: "var(--err-soft)", color: "var(--err)" }}
                    ><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {scannedItems.length === 0 && (
        <p className="py-6 text-center text-sm text-tx-mut">Sin ingredientes. Agrega manualmente o cancela.</p>
      )}

      <div className="mt-6 pt-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
        <button
          type="button"
          onClick={() => setScannedItems(p => [...p, { name: "", totalCost: 0, quantityFound: 1, unit: "pz" }])}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-ds-md px-4 text-xs font-bold text-tx-mid"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
        >
          <Plus size={14} /> Agregar fila
        </button>
      </div>
    </Modal>
  );
}
