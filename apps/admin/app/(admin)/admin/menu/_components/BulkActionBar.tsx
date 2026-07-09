"use client";
import { Power, Trash2, X } from "lucide-react";

/* Barra flotante de acciones en lote (activar/desactivar/mover/eliminar). */
export function BulkActionBar({
  count,
  cats,
  onActivate,
  onDeactivate,
  onChangeCategory,
  onDelete,
  onClear,
}: {
  count: number;
  cats: any[];
  onActivate: () => void;
  onDeactivate: () => void;
  onChangeCategory: (categoryId: string) => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  return (
    <div className="ds-scrollbar fixed bottom-3 left-3 right-3 z-40 flex items-center gap-2 overflow-x-auto rounded-ds-lg px-3 py-2.5 sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:gap-3 sm:px-5 sm:py-3"
      style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "var(--shadow-lg)" }}>
      <span className="flex-shrink-0 rounded-ds-sm px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-primary" style={{ background: "var(--accent-soft)" }}>
        {count} <span className="hidden sm:inline">seleccionado{count !== 1 ? "s" : ""}</span>
      </span>
      <button onClick={onActivate}
        className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-ds-md px-3 text-xs font-bold transition-all"
        style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
        <Power size={13} strokeWidth={2.2} /> Activar
      </button>
      <button onClick={onDeactivate}
        className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-ds-md px-3 text-xs font-bold transition-all"
        style={{ background: "var(--err-soft)", color: "var(--err)" }}>
        <Power size={13} strokeWidth={2.2} /> Desactivar
      </button>
      <select onChange={e => { onChangeCategory(e.target.value); e.target.value = ""; }}
        defaultValue=""
        className="min-h-9 max-w-[140px] flex-shrink-0 rounded-ds-md px-3 text-xs font-bold text-tx outline-none sm:max-w-none"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
        <option value="" disabled>Mover a categoría…</option>
        {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <button onClick={onDelete}
        className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-ds-md px-3 text-xs font-bold transition-all"
        style={{ background: "var(--err-soft)", color: "var(--err)" }}>
        <Trash2 size={13} /> <span className="hidden sm:inline">Eliminar</span>
      </button>
      <button onClick={onClear} aria-label="Cerrar selección"
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-ds-md text-tx-mut transition-all"
        style={{ background: "var(--surf-2)" }}><X size={15} /></button>
    </div>
  );
}
