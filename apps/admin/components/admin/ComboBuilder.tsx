"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useToast, useConfirm } from "@/components/ds";

// Editor de combos configurables: define los "slots" (Principal, Guarnición,
// Bebida…) de un MenuItem isCombo y las opciones de cada slot (que apuntan a
// otros productos reales, con upgrade de precio). Espeja a ModifierGroupsEditor.

type Option = {
  id: string;
  optionMenuItemId: string;
  priceDelta: number;
  isAvailable: boolean;
  optionMenuItem?: { id: string; name: string };
};
type Component = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  sortOrder: number;
  options: Option[];
};
type ProductRef = { id: string; name: string };

export default function ComboBuilder({ itemId, products }: { itemId: string; products: ProductRef[] }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [components, setComponents] = useState<Component[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [optForms, setOptForms] = useState<Record<string, { optionMenuItemId: string; priceDelta: string }>>({});

  async function fetchComponents() {
    try {
      const { data } = await api.get(`/api/menu/items/${itemId}`);
      setComponents(Array.isArray(data?.comboComponents) ? data.comboComponents : []);
    } catch {
      setComponents([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { if (itemId) fetchComponents(); }, [itemId]);

  async function addComponent() {
    if (!newName.trim()) return;
    try {
      await api.post(`/api/menu/items/${itemId}/combo-components`, { name: newName.trim() });
      setNewName("");
      await fetchComponents();
    } catch (e: any) { toast.error(e?.response?.data?.error || "Error al crear componente"); }
  }
  async function deleteComponent(id: string) {
    if (!(await confirm({ title: "¿Eliminar este componente y sus opciones?", danger: true, confirmLabel: "Eliminar" }))) return;
    try { await api.delete(`/api/menu/combo-components/${id}`); await fetchComponents(); }
    catch (e: any) { toast.error(e?.response?.data?.error || "Error al eliminar"); }
  }
  async function updateComponent(c: Component, patch: Partial<Component>) {
    try { await api.put(`/api/menu/combo-components/${c.id}`, patch); await fetchComponents(); }
    catch (e: any) { toast.error(e?.response?.data?.error || "Error al actualizar"); }
  }
  function setOptField(componentId: string, patch: Partial<{ optionMenuItemId: string; priceDelta: string }>) {
    setOptForms((prev) => ({ ...prev, [componentId]: { optionMenuItemId: "", priceDelta: "0", ...prev[componentId], ...patch } }));
  }
  async function addOption(componentId: string) {
    const f = optForms[componentId];
    if (!f?.optionMenuItemId) return;
    try {
      await api.post(`/api/menu/combo-components/${componentId}/options`, {
        optionMenuItemId: f.optionMenuItemId,
        priceDelta: parseFloat(f.priceDelta) || 0,
      });
      setOptForms((prev) => ({ ...prev, [componentId]: { optionMenuItemId: "", priceDelta: "0" } }));
      await fetchComponents();
    } catch (e: any) { toast.error(e?.response?.data?.error || "Error al agregar opción"); }
  }
  async function deleteOption(optionId: string) {
    try { await api.delete(`/api/menu/combo-options/${optionId}`); await fetchComponents(); }
    catch (e: any) { toast.error(e?.response?.data?.error || "Error al eliminar opción"); }
  }

  if (loading) return <p className="text-xs px-1 text-tx-mut">Cargando combo…</p>;

  const available = products.filter((p) => p.id !== itemId);

  return (
    <div className="flex flex-col gap-3">
      {components.length === 0 && (
        <p className="text-xs px-1 text-tx-mut">
          Sin componentes. Agrega los slots del combo (ej. “Principal”, “Guarnición”, “Bebida”) y dentro las opciones.
        </p>
      )}

      {components.map((c) => {
        const optForm = optForms[c.id] || { optionMenuItemId: "", priceDelta: "0" };
        return (
          <div key={c.id} className="rounded-ds-md border p-3 flex flex-col gap-2" style={{ background: "var(--surf-2)", borderColor: "var(--bd-1)" }}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) updateComponent(c, { name: v }); }}
                  className="bg-transparent text-sm font-bold outline-none text-tx"
                />
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-tx-mut">
                  <input type="checkbox" checked={c.isRequired} onChange={(e) => updateComponent(c, { isRequired: e.target.checked })} />
                  Obligatorio
                  <span className="ml-2">máx</span>
                  <input
                    type="number" min={1} defaultValue={c.maxSelect}
                    onBlur={(e) => { const v = parseInt(e.target.value) || 1; if (v !== c.maxSelect) updateComponent(c, { maxSelect: v }); }}
                    className="w-12 bg-transparent text-center outline-none text-tx"
                  />
                </label>
              </div>
              <button type="button" onClick={() => deleteComponent(c.id)} className="px-2 py-1 rounded-ds-sm text-[11px] font-bold" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--err)" }}>
                Borrar
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {c.options.length === 0 && <p className="text-[11px] px-1 text-tx-mut">Sin opciones aún.</p>}
              {c.options.map((o) => (
                <div key={o.id} className="flex items-center gap-2 px-2 py-1.5 rounded-ds-sm" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
                  <span className="flex-1 truncate text-sm font-bold text-tx">{o.optionMenuItem?.name || o.optionMenuItemId}</span>
                  <span className="text-xs font-mono text-tx-mut">{o.priceDelta > 0 ? `+$${o.priceDelta}` : "—"}</span>
                  <button type="button" onClick={() => deleteOption(o.id)} className="w-6 h-6 rounded-md text-xs font-black" style={{ background: "var(--surf-2)", color: "var(--err)" }} aria-label="Eliminar opción">✕</button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5">
              <select
                value={optForm.optionMenuItemId}
                onChange={(e) => setOptField(c.id, { optionMenuItemId: e.target.value })}
                className="flex-1 px-2.5 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              >
                <option value="">— Producto —</option>
                {available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <input
                type="number" step="0.01" placeholder="+$0" value={optForm.priceDelta}
                onChange={(e) => setOptField(c.id, { priceDelta: e.target.value })}
                className="w-20 px-2.5 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
              <button type="button" onClick={() => addOption(c.id)} disabled={!optForm.optionMenuItemId} className="px-3 py-1.5 rounded-ds-sm text-xs font-black" style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)", opacity: optForm.optionMenuItemId ? 1 : 0.5 }}>+</button>
            </div>
          </div>
        );
      })}

      <div className="flex gap-1.5">
        <input
          placeholder="Nuevo componente (ej. Bebida)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="flex-1 px-2.5 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
          style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
        />
        <button type="button" onClick={addComponent} disabled={!newName.trim()} className="px-3 py-1.5 rounded-ds-sm text-xs font-black" style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)", opacity: newName.trim() ? 1 : 0.5 }}>
          + Componente
        </button>
      </div>
    </div>
  );
}
