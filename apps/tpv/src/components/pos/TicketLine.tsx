"use client";
import React, { useState, useRef } from "react";
import { X, Plus, Minus, MessageSquare, Check, Pencil, Scale } from "lucide-react";
import { isWeighable, formatQty } from "@/store/ticketStore";

interface TicketLineProps {
  id?: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  modifiers?: { name: string; priceAdd: number }[];
  onUpdateQty?: (qty: number) => void;
  onIncrease?: () => void;
  onDecrease?: () => void;
  onRemove?: () => void;
  onUpdateNotes?: (notes: string) => void;
  // Reabre el configurador (variantes/modificadores/complementos) para
  // editar este item. Solo se pasa cuando el producto tiene opciones.
  onEdit?: () => void;
  // Unidad de venta. Si es pesable (g/kg) la línea muestra el peso y reabre el
  // WeightModal en modo ABSOLUTO en vez del stepper ±1.
  unit?: string;
  onEditWeight?: () => void;
  currency?: string;
}

const TicketLine: React.FC<TicketLineProps> = ({
  name,
  price,
  quantity,
  notes,
  modifiers,
  onUpdateQty,
  onIncrease,
  onDecrease,
  onRemove,
  onUpdateNotes,
  onEdit,
  unit,
  onEditWeight,
  currency = "$",
}) => {
  const weighable = isWeighable(unit);
  const inc = () => (onIncrease ? onIncrease() : onUpdateQty?.(quantity + 1));
  const dec = () =>
    onDecrease ? onDecrease() : onUpdateQty?.(Math.max(0, quantity - 1));

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes ?? "");
  // Escape descarta sin guardar; como también disparamos blur al cancelar,
  // este flag evita que el commit de onBlur sobrescriba con el borrador.
  const cancelNextCommit = useRef(false);

  const startEdit = () => {
    if (!onUpdateNotes) return;
    setDraft(notes ?? "");
    setEditing(true);
  };

  // Se invoca al pulsar ✓, Enter Y al perder el foco (onBlur). Antes solo
  // ✓/Enter guardaban: si el cajero escribía la nota y tocaba "Cobrar/Guardar"
  // sin confirmar, la nota se perdía y la comanda salía sin ella.
  const commitEdit = () => {
    if (!onUpdateNotes) return;
    if (cancelNextCommit.current) {
      cancelNextCommit.current = false;
      setDraft(notes ?? "");
      setEditing(false);
      return;
    }
    onUpdateNotes(draft);
    setEditing(false);
  };
    
  return (
    <div className="group flex items-center gap-3 py-2.5 border-b border-white/5 last:border-0">
      {/* PESABLES: chip con el peso que reabre el WeightModal (modo absoluto).
          NO PESABLES: stepper vertical ±1 (touch optimized). */}
      {weighable ? (
        <button
          type="button"
          onClick={onEditWeight}
          aria-label="Editar peso"
          className="flex flex-col items-center justify-center gap-0.5 min-w-[3.25rem] px-1 py-1.5 self-center bg-[#121316] rounded-lg border border-white/5 shrink-0 active:scale-95 transition-transform"
        >
          <Scale size={13} className="text-amber-500/80" />
          <span className="text-[12px] font-black text-white mono tnum leading-none">
            {formatQty(quantity, unit)}
          </span>
        </button>
      ) : (
        <div className="flex flex-col items-center w-9 self-center bg-[#121316] rounded-lg border border-white/5 overflow-hidden shrink-0">
          <button
            onClick={inc}
            className="w-full h-8 flex items-center justify-center text-zinc-500 active:text-amber-500 active:bg-white/5 transition-all active:scale-90"
          >
            <Plus size={15} strokeWidth={3} />
          </button>
          <span className="text-[13px] font-black text-white mono tnum leading-none py-0.5">
            {quantity}
          </span>
          <button
            onClick={dec}
            className="w-full h-8 flex items-center justify-center text-zinc-500 active:text-red-500 active:bg-white/5 transition-all active:scale-90"
          >
            <Minus size={15} strokeWidth={3} />
          </button>
        </div>
      )}

      {/* INFO PRODUCTO */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        {/* Fila principal: nombre + total alineado a la derecha (estilo recibo) */}
        <div className="flex justify-between items-start gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={onEdit}
              className="group/edit flex min-w-0 flex-1 items-start gap-1.5 text-left active:scale-[0.99] transition-transform"
            >
              <span className="text-sm font-black text-white leading-snug tracking-tight line-clamp-2">
                {name}
              </span>
              <Pencil
                size={12}
                className="mt-1 shrink-0 text-zinc-600 group-active/edit:text-amber-500 transition-colors"
              />
            </button>
          ) : (
            <span className="min-w-0 flex-1 text-sm font-black text-white leading-snug tracking-tight line-clamp-2">
              {name}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-sm font-black text-amber-500 mono tabular-nums">
              {currency}{(price * quantity).toFixed(2)}
            </span>
            {onRemove && (
              <button
                onClick={onRemove}
                aria-label="Quitar producto"
                className="-mr-1 text-zinc-700 active:text-red-500 transition-all p-1 active:scale-90"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Precio unitario discreto bajo el nombre */}
        <span className="text-[10px] text-zinc-600 font-bold mono tabular-nums">
          {currency}{price.toFixed(2)} {weighable ? `/ ${unit}` : "c/u"}
        </span>

        {modifiers && modifiers.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-0.5">
            {modifiers.map((m, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#1a1b1f] border border-white/5 text-[9px] text-zinc-400 font-black uppercase tracking-wider"
              >
                {m.name}
                {m.priceAdd > 0 && (
                  <span className="text-amber-500/80 mono">+{currency}{m.priceAdd.toFixed(2)}</span>
                )}
              </span>
            ))}
          </div>
        )}

        {editing && onUpdateNotes ? (
          <div className="flex items-center gap-2 mt-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 200))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                if (e.key === "Escape") {
                  cancelNextCommit.current = true;
                  (e.target as HTMLInputElement).blur();
                }
              }}
              onBlur={commitEdit}
              placeholder="Nota para cocina..."
              className="flex-1 min-w-0 h-8 min-h-[32px] bg-[#0a0a0c] border border-amber-500/30 rounded-lg px-2 text-[11px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-amber-500"
            />
            <button
              onClick={commitEdit}
              aria-label="Guardar nota"
              className="w-8 h-8 min-h-[32px] rounded-lg bg-amber-500 text-black flex items-center justify-center active:scale-90 transition-transform"
            >
              <Check size={14} strokeWidth={3} />
            </button>
          </div>
        ) : notes ? (
          <button
            type="button"
            onClick={onUpdateNotes ? startEdit : undefined}
            className="flex items-center gap-1.5 text-left mt-0.5 active:scale-[0.99] transition-transform"
          >
            <MessageSquare size={10} className="text-amber-500/70 shrink-0" />
            <p className="text-[10px] text-zinc-400 font-bold italic line-clamp-1 flex-1 min-w-0">
              {notes}
            </p>
          </button>
        ) : onUpdateNotes ? (
          <button
            type="button"
            onClick={startEdit}
            className="flex items-center gap-1 mt-0.5 text-zinc-700 active:text-amber-500 transition-colors w-fit"
          >
            <MessageSquare size={10} />
            <span className="text-[9px] font-black uppercase tracking-widest">
              Agregar nota
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default TicketLine;
