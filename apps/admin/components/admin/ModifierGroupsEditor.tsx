"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { useToast, useConfirm } from "@/components/ds";

type Modifier = {
  id: string;
  name: string;
  priceAdd: number;
  isDefault: boolean;
  isAvailable?: boolean;
};

type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: number;
  maxSelection: number;
  freeModifiersLimit: number;
  groupType?: string;
  modifiers: Modifier[];
};

type GroupForm = {
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: string;
  maxSelection: string;
  freeModifiersLimit: string;
  groupType: string;
};

const emptyGroupForm: GroupForm = {
  name: "",
  required: false,
  multiSelect: false,
  minSelection: "0",
  maxSelection: "0",
  freeModifiersLimit: "0",
  groupType: "ADD",
};

export default function ModifierGroupsEditor({ itemId }: { itemId: string }) {
  const toast = useToast();
  const confirm = useConfirm();

  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [savingGroup, setSavingGroup] = useState(false);

  // Inline form to add a modifier inside a group (groupId → form state)
  const [modForms, setModForms] = useState<Record<string, { name: string; priceAdd: string; isDefault: boolean }>>({});
  const [savingMod, setSavingMod] = useState<string | null>(null);

  async function fetchGroups() {
    try {
      const { data } = await api.get(`/api/menu/items/${itemId}`);
      setGroups(Array.isArray(data?.modifierGroups) ? data.modifierGroups : []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (itemId) fetchGroups();
  }, [itemId]);

  function openNewGroup() {
    setEditingGroupId(null);
    setGroupForm(emptyGroupForm);
    setShowGroupForm(true);
  }

  function openEditGroup(g: ModifierGroup) {
    setEditingGroupId(g.id);
    setGroupForm({
      name: g.name,
      required: g.required,
      multiSelect: g.multiSelect,
      minSelection: String(g.minSelection),
      maxSelection: String(g.maxSelection),
      freeModifiersLimit: String(g.freeModifiersLimit),
      groupType: g.groupType || "ADD",
    });
    setShowGroupForm(true);
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setSavingGroup(true);
    try {
      const payload = {
        name: groupForm.name.trim(),
        required: groupForm.required,
        multiSelect: groupForm.multiSelect,
        minSelection: parseInt(groupForm.minSelection) || 0,
        maxSelection: parseInt(groupForm.maxSelection) || 0,
        freeModifiersLimit: parseInt(groupForm.freeModifiersLimit) || 0,
        groupType: groupForm.groupType === "REMOVE" ? "REMOVE" : "ADD",
      };
      if (editingGroupId) {
        await api.put(`/api/menu/modifier-groups/${editingGroupId}`, payload);
      } else {
        await api.post(`/api/menu/items/${itemId}/modifier-groups`, payload);
      }
      setShowGroupForm(false);
      setEditingGroupId(null);
      setGroupForm(emptyGroupForm);
      await fetchGroups();
    } catch (err: any) {
      toast.error("Error al guardar grupo: " + (err?.response?.data?.error || err?.message || "desconocido"));
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!(await confirm({ title: "¿Eliminar este grupo y todos sus modificadores?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/menu/modifier-groups/${id}`);
      await fetchGroups();
    } catch (err: any) {
      toast.error("Error al eliminar: " + (err?.response?.data?.error || err?.message));
    }
  }

  function setModField(groupId: string, patch: Partial<{ name: string; priceAdd: string; isDefault: boolean }>) {
    setModForms((prev) => ({
      ...prev,
      [groupId]: { name: "", priceAdd: "0", isDefault: false, ...prev[groupId], ...patch },
    }));
  }

  async function addModifier(groupId: string) {
    const f = modForms[groupId];
    if (!f?.name?.trim()) return;
    setSavingMod(groupId);
    try {
      await api.post(`/api/menu/modifier-groups/${groupId}/modifiers`, {
        name: f.name.trim(),
        priceAdd: parseFloat(f.priceAdd) || 0,
        isDefault: !!f.isDefault,
      });
      setModForms((prev) => ({ ...prev, [groupId]: { name: "", priceAdd: "0", isDefault: false } }));
      await fetchGroups();
    } catch (err: any) {
      toast.error("Error al agregar modificador: " + (err?.response?.data?.error || err?.message));
    } finally {
      setSavingMod(null);
    }
  }

  async function deleteModifier(modId: string) {
    if (!(await confirm({ title: "¿Eliminar este modificador?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/menu/modifiers/${modId}`);
      await fetchGroups();
    } catch (err: any) {
      toast.error("Error al eliminar: " + (err?.response?.data?.error || err?.message));
    }
  }

  async function updateModifierField(mod: Modifier, patch: Partial<{ name: string; priceAdd: number; isDefault: boolean; isAvailable: boolean }>) {
    try {
      await api.put(`/api/menu/modifiers/${mod.id}`, patch);
      await fetchGroups();
    } catch (err: any) {
      toast.error("Error al actualizar: " + (err?.response?.data?.error || err?.message));
    }
  }

  if (loading) {
    return <p className="text-xs px-1 text-tx-mut">Cargando modificadores…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && !showGroupForm && (
        <p className="text-xs px-1 text-tx-mut">
          Sin modificadores. Agrega un grupo (ej. “Tipo de leche”, “Sin azúcar”) y dentro las opciones.
        </p>
      )}

      {groups.map((g) => {
        const modForm = modForms[g.id] || { name: "", priceAdd: "0", isDefault: false };
        return (
          <div
            key={g.id}
            className="rounded-ds-md border p-3 flex flex-col gap-2"
            style={{ background: "var(--surf-2)", borderColor: "var(--bd-1)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-bold text-sm flex items-center gap-1.5 text-tx">
                  {g.name}
                  {g.groupType === "REMOVE" && (
                    <span className="rounded px-1.5 py-0.5 text-[9px] font-black uppercase text-tx-mut" style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>Quitar</span>
                  )}
                </span>
                <span className="text-[11px] text-tx-mut">
                  {g.multiSelect ? "Multi-selección" : "Selección única"}
                  {g.required ? " · Obligatorio" : " · Opcional"}
                  {g.maxSelection > 0 ? ` · máx ${g.maxSelection}` : ""}
                  {g.freeModifiersLimit > 0 ? ` · ${g.freeModifiersLimit} sin costo` : ""}
                </span>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditGroup(g)}
                  className="px-2 py-1 rounded-ds-sm text-[11px] font-bold text-tx-mut"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(g.id)}
                  className="px-2 py-1 rounded-ds-sm text-[11px] font-bold"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--err)" }}
                >
                  Borrar
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {g.modifiers.length === 0 && (
                <p className="text-[11px] px-1 text-tx-mut">Sin opciones aún.</p>
              )}
              {g.modifiers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-ds-sm"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                >
                  <input
                    defaultValue={m.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== m.name) updateModifierField(m, { name: v });
                    }}
                    className="flex-1 bg-transparent text-sm font-bold outline-none text-tx"
                  />
                  <div className="flex items-center gap-1 text-xs text-tx-mut">
                    <span>+$</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={m.priceAdd}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        if (v !== m.priceAdd) updateModifierField(m, { priceAdd: v });
                      }}
                      className="w-16 bg-transparent text-right outline-none text-tx"
                    />
                  </div>
                  <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer text-tx-mut">
                    <input
                      type="checkbox"
                      checked={m.isDefault}
                      onChange={(e) => updateModifierField(m, { isDefault: e.target.checked })}
                    />
                    DEFAULT
                  </label>
                  <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer" style={{ color: m.isAvailable === false ? "var(--err)" : "var(--tx-mut)" }} title="Agotado: no se puede pedir desde la tienda en línea">
                    <input
                      type="checkbox"
                      checked={m.isAvailable === false}
                      onChange={(e) => updateModifierField(m, { isAvailable: !e.target.checked })}
                    />
                    AGOTADO
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteModifier(m.id)}
                    className="w-6 h-6 rounded-md text-xs font-black"
                    style={{ background: "var(--surf-2)", color: "var(--err)" }}
                    aria-label="Eliminar modificador"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5">
              <input
                placeholder={g.groupType === "REMOVE" ? "Quitar (ej. Cebolla)" : "Nueva opción (ej. Leche light)"}
                value={modForm.name}
                onChange={(e) => setModField(g.id, { name: e.target.value })}
                className="flex-1 px-2.5 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
              {g.groupType !== "REMOVE" && (
                <input
                  type="number"
                  step="0.01"
                  placeholder="+$0"
                  value={modForm.priceAdd}
                  onChange={(e) => setModField(g.id, { priceAdd: e.target.value })}
                  className="w-20 px-2.5 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                />
              )}
              <button
                type="button"
                onClick={() => addModifier(g.id)}
                disabled={savingMod === g.id || !modForm.name.trim()}
                className="px-3 py-1.5 rounded-ds-sm text-xs font-black"
                style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)", opacity: savingMod === g.id || !modForm.name.trim() ? 0.5 : 1 }}
              >
                +
              </button>
            </div>
          </div>
        );
      })}

      {showGroupForm ? (
        <form
          onSubmit={saveGroup}
          className="rounded-ds-md border p-3 flex flex-col gap-2"
          style={{ background: "var(--surf-2)", borderColor: "var(--brand-primary)" }}
        >
          <input
            autoFocus
            placeholder="Nombre del grupo (ej. Tipo de leche)"
            value={groupForm.name}
            onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
            className="px-2.5 py-1.5 rounded-ds-sm text-sm outline-none text-tx"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
            required
          />
          <div className="flex gap-1.5 text-xs">
            {(["ADD", "REMOVE"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setGroupForm((p) => ({ ...p, groupType: t }))}
                className="flex-1 py-1.5 rounded-ds-sm font-bold border"
                style={groupForm.groupType === t
                  ? { background: "var(--brand-primary)", color: "var(--accent-contrast)", borderColor: "var(--brand-primary)" }
                  : { background: "var(--surf-1)", color: "var(--tx-mut)", borderColor: "var(--bd-1)" }}
              >
                {t === "ADD" ? "Agregar (extras +$)" : "Quitar (Sin… gratis)"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-tx-mut">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={groupForm.required}
                onChange={(e) => setGroupForm((p) => ({ ...p, required: e.target.checked }))}
              />
              Obligatorio
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={groupForm.multiSelect}
                onChange={(e) => setGroupForm((p) => ({ ...p, multiSelect: e.target.checked }))}
              />
              Multi-selección
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-tx-mut">
              MIN
              <input
                type="number"
                min="0"
                value={groupForm.minSelection}
                onChange={(e) => setGroupForm((p) => ({ ...p, minSelection: e.target.value }))}
                className="px-2 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-tx-mut">
              MAX
              <input
                type="number"
                min="0"
                value={groupForm.maxSelection}
                onChange={(e) => setGroupForm((p) => ({ ...p, maxSelection: e.target.value }))}
                className="px-2 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-tx-mut">
              SIN COSTO N
              <input
                type="number"
                min="0"
                value={groupForm.freeModifiersLimit}
                onChange={(e) => setGroupForm((p) => ({ ...p, freeModifiersLimit: e.target.value }))}
                className="px-2 py-1.5 rounded-ds-sm text-xs outline-none text-tx"
                style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowGroupForm(false);
                setEditingGroupId(null);
              }}
              className="flex-1 py-1.5 rounded-ds-sm text-xs font-bold border text-tx-mut"
              style={{ borderColor: "var(--bd-1)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingGroup}
              className="flex-1 py-1.5 rounded-ds-sm text-xs font-black"
              style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)", opacity: savingGroup ? 0.5 : 1 }}
            >
              {editingGroupId ? "Actualizar" : "Crear grupo"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openNewGroup}
          className="w-full py-2 rounded-ds-md text-xs font-bold border border-dashed transition-all text-primary"
          style={{ borderColor: "var(--brand-primary)" }}
        >
          + Nuevo grupo de modificadores
        </button>
      )}
    </div>
  );
}
