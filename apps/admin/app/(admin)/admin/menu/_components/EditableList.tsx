"use client";
import { Check, Pencil, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

/* Lista editable de opciones (variantes / complementos).
   IMPORTANTE: definida a nivel de módulo (no dentro del componente padre). Si se
   anida dentro del padre, React la trata como un tipo nuevo en cada render y
   re-monta el subárbol en cada tecla → el input pierde el foco y en tablet/móvil
   se cierra el teclado. */
export function EditableList({
  items,
  editingId,
  editForm,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onChangeForm,
  addSection,
}: {
  items: any[];
  editingId: string | null;
  editForm: { name: string; price: string };
  onStartEdit: (item: any) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  onChangeForm: (updater: (prev: { name: string; price: string }) => { name: string; price: string }) => void;
  addSection: ReactNode;
}) {
  return (
    <div>
      {items.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          <div className="grid grid-cols-12 gap-2 px-3 pb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">
            <span className="col-span-6">Nombre</span>
            <span className="col-span-3 text-right">Precio</span>
            <span className="col-span-3"></span>
          </div>
          {items.map((item: any) => (
            <div key={item.id}>
              {editingId === item.id ? (
                <div className="grid grid-cols-12 items-center gap-2 rounded-ds-md p-2"
                  style={{ background: "var(--surf-2)", border: "1.5px solid var(--brand-primary)" }}>
                  <input value={editForm.name}
                    onChange={e => onChangeForm((p) => ({ ...p, name: e.target.value }))}
                    className="col-span-6 rounded-ds-sm px-2 py-1.5 text-sm text-tx outline-none"
                    style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }} />
                  <div className="col-span-3 flex items-center gap-1">
                    <span className="text-xs text-tx-mut">$</span>
                    <input value={editForm.price} type="number" inputMode="decimal"
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => onChangeForm((p) => ({ ...p, price: e.target.value }))}
                      className="w-full rounded-ds-sm px-2 py-1.5 text-right text-sm text-tx outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }} />
                  </div>
                  <div className="col-span-3 flex justify-end gap-1">
                    <button type="button" onClick={() => onSaveEdit(item.id)} aria-label="Guardar"
                      className="grid h-8 w-8 place-items-center rounded-ds-sm"
                      style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)" }}><Check size={14} strokeWidth={2.6} /></button>
                    <button type="button" onClick={onCancelEdit} aria-label="Cancelar"
                      className="grid h-8 w-8 place-items-center rounded-ds-sm text-tx-mut"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}><X size={14} /></button>
                  </div>
                </div>
              ) : (
                <div className="group grid grid-cols-12 items-center gap-2 rounded-ds-md px-3 py-2 transition-all"
                  style={{ background: "var(--surf-2)" }}>
                  <span className="col-span-6 text-sm font-medium text-tx">{item.name}</span>
                  <span className="col-span-3 text-right font-mono text-sm font-bold text-primary">
                    ${item.price > 0 ? item.price : '0.00'}
                  </span>
                  <div className="col-span-3 flex justify-end gap-1">
                    <button type="button" onClick={() => onStartEdit(item)} aria-label="Editar"
                      className="grid h-8 w-8 place-items-center rounded-ds-sm text-primary opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                      style={{ background: "var(--accent-soft)" }}><Pencil size={13} /></button>
                    <button type="button" onClick={() => onDelete(item.id)} aria-label="Eliminar"
                      className="grid h-8 w-8 place-items-center rounded-ds-sm opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                      style={{ background: "var(--err-soft)", color: "var(--err)" }}><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {addSection}
    </div>
  );
}

export type EditableCtl = {
  items: any[];
  newItem: { name: string; price: string };
  setNewItem: (updater: (prev: { name: string; price: string }) => { name: string; price: string }) => void;
  onAdd: () => void;
  saving: boolean;
  editingId: string | null;
  editForm: { name: string; price: string };
  setEditForm: (updater: (prev: { name: string; price: string }) => { name: string; price: string }) => void;
  onStartEdit: (item: any) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
};
