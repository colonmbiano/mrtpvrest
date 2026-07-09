"use client";
import { Check } from "lucide-react";
import { Button, Modal, Pill, ProgressBar } from "@/components/ds";

type Item = {
  id: string;
  name: string;
  categoryId: string | null;
  imageUrl?: string | null;
};
type Cat = { id: string; name: string };
type BulkRow = { file: File; url: string; targetId: string; score: number };

/* Modal de revisión del emparejado en lote (auto-match por nombre de archivo).
   Confirma a qué producto va cada foto antes de subir. */
export function BulkMatchModal({
  rows,
  items,
  cats,
  busy,
  progress,
  onClose,
  onChangeTarget,
  onApply,
}: {
  rows: BulkRow[];
  items: Item[];
  cats: Cat[];
  busy: boolean;
  progress: { done: number; total: number };
  onClose: () => void;
  onChangeTarget: (idx: number, targetId: string) => void;
  onApply: () => void;
}) {
  const assigned = rows.filter(r => r.targetId).length;
  const skipped = rows.filter(r => !r.targetId).length;
  const known = new Set(cats.map(c => c.id));
  const others = items.filter(i => !i.categoryId || !known.has(i.categoryId));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Revisar emparejado"
      subtitle={`${rows.length} foto(s). Confirma a qué producto va cada una.`}
      footer={
        <div className="flex w-full flex-col gap-3">
          {busy && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-bold text-tx">Subiendo…</span>
                <span className="font-mono text-tx-mut">{progress.done}/{progress.total}</span>
              </div>
              <ProgressBar pct={progress.total ? (progress.done / progress.total) * 100 : 0} />
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-tx-mut">
              {assigned} asignada(s) · {skipped} omitida(s)
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose} disabled={busy}>Cancelar</Button>
              <Button icon={Check} onClick={onApply} disabled={busy}>
                {busy ? "Subiendo…" : `Aplicar ${assigned} foto(s)`}
              </Button>
            </div>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        {rows.map((row, idx) => {
          const target = items.find(i => i.id === row.targetId);
          const willOverwrite = target?.imageUrl;
          return (
            <div key={idx} className="flex items-center gap-3 rounded-ds-md p-2" style={{ background: "var(--surf-2)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.url} alt={row.file.name} className="h-14 w-14 flex-shrink-0 rounded-ds-sm object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] text-tx-mut" title={row.file.name}>{row.file.name}</div>
                <select
                  value={row.targetId}
                  onChange={e => onChangeTarget(idx, e.target.value)}
                  disabled={busy}
                  className="mt-1 min-h-9 w-full rounded-ds-sm px-2 text-sm font-bold text-tx outline-none"
                  style={{ background: "var(--surf-1)", border: `1.5px solid ${row.targetId ? "var(--brand-primary)" : "var(--bd-1)"}` }}
                >
                  <option value="">— Sin asignar (omitir) —</option>
                  {cats.map(c => (
                    <optgroup key={c.id} label={c.name}>
                      {items.filter(i => i.categoryId === c.id).map(i => (
                        <option key={i.id} value={i.id}>{i.name}{i.imageUrl ? " · (ya tiene)" : ""}</option>
                      ))}
                    </optgroup>
                  ))}
                  {others.length > 0 && (
                    <optgroup label="Otros">
                      {others.map(i => (
                        <option key={i.id} value={i.id}>{i.name}{i.imageUrl ? " · (ya tiene)" : ""}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="flex w-16 flex-shrink-0 justify-end">
                {!row.targetId ? (
                  <Pill tone="neutral">omitir</Pill>
                ) : willOverwrite ? (
                  <Pill tone="warn">reemplaza</Pill>
                ) : (
                  <Pill tone="ok">nueva</Pill>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

export type { BulkRow };
