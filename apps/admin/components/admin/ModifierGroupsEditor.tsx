"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type Modifier = {
  id: string;
  name: string;
  priceAdd: number;
  isDefault: boolean;
};

type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: number;
  maxSelection: number;
  freeModifiersLimit: number;
  modifiers: Modifier[];
};

type GroupForm = {
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: string;
  maxSelection: string;
  freeModifiersLimit: string;
};

const emptyGroupForm: GroupForm = {
  name: "",
  required: false,
  multiSelect: false,
  minSelection: "0",
  maxSelection: "0",
  freeModifiersLimit: "0",
};

export default function ModifierGroupsEditor({ itemId }: { itemId: string }) {
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
      alert("Error al guardar grupo: " + (err?.response?.data?.error || err?.message || "desconocido"));
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("¿Eliminar este grupo y todos sus modificadores?")) return;
    try {
      await api.delete(`/api/menu/modifier-groups/${id}`);
      await fetchGroups();
    } catch (err: any) {
      alert("Error al eliminar: " + (err?.response?.data?.error || err?.message));
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
      alert("Error al agregar modificador: " + (err?.response?.data?.error || err?.message));
    } finally {
      setSavingMod(null);
    }
  }

  async function deleteModifier(modId: string) {
    if (!confirm("¿Eliminar este modificador?")) return;
    try {
      await api.delete(`/api/menu/modifiers/${modId}`);
      await fetchGroups();
    } catch (err: any) {
      alert("Error al eliminar: " + (err?.response?.data?.error || err?.message));
    }
  }

  async function updateModifierField(mod: Modifier, patch: Partial<{ name: string; priceAdd: number; isDefault: boolean }>) {
    try {
      await api.put(`/api/menu/modifiers/${mod.id}`, patch);
      await fetchGroups();
    } catch (err: any) {
      alert("Error al actualizar: " + (err?.response?.data?.error || err?.message));
    }
  }

  if (loading) {
    return <p className="text-xs px-1" style={{ color: "var(--muted)" }}>Cargando modificadores…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && !showGroupForm && (
        <p className="text-xs px-1" style={{ color: "var(--muted)" }}>
          Sin modificadores. Agrega un grupo (ej. “Tipo de leche”, “Sin azúcar”) y dentro las opciones.
        </p>
      )}

      {groups.map((g) => {
        const modForm = modForms[g.id] || { name: "", priceAdd: "0", isDefault: false };
        return (
          <div
            key={g.id}
            className="rounded-xl border p-3 flex flex-col gap-2"
            style={{ background: "var(--surf2)", borderColor: "var(--border)" }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col">
                <span className="font-bold text-sm">{g.name}</span>
                <span className="text-[11px]" style={{ color: "var(--muted)" }}>
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
                  className="px-2 py-1 rounded-lg text-[11px] font-bold"
                  style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--muted)" }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => deleteGroup(g.id)}
                  className="px-2 py-1 rounded-lg text-[11px] font-bold"
                  style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "#ff5c35" }}
                >
                  Borrar
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              {g.modifiers.length === 0 && (
                <p className="text-[11px] px-1" style={{ color: "var(--muted)" }}>Sin opciones aún.</p>
              )}
              {g.modifiers.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                  style={{ background: "var(--surf)", border: "1px solid var(--border)" }}
                >
                  <input
                    defaultValue={m.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== m.name) updateModifierField(m, { name: v });
                    }}
                    className="flex-1 bg-transparent text-sm font-bold outline-none"
                    style={{ color: "var(--text)" }}
                  />
                  <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
                    <span>+$</span>
                    <input
                      type="number"
                      step="0.01"
                      defaultValue={m.priceAdd}
                      onBlur={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        if (v !== m.priceAdd) updateModifierField(m, { priceAdd: v });
                      }}
                      className="w-16 bg-transparent text-right outline-none"
                      style={{ color: "var(--text)" }}
                    />
                  </div>
                  <label className="flex items-center gap-1 text-[10px] font-bold cursor-pointer" style={{ color: "var(--muted)" }}>
                    <input
                      type="checkbox"
                      checked={m.isDefault}
                      onChange={(e) => updateModifierField(m, { isDefault: e.target.checked })}
                    />
                    DEFAULT
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteModifier(m.id)}
                    className="w-6 h-6 rounded-md text-xs font-black"
                    style={{ background: "var(--surf2)", color: "#ff5c35" }}
                    aria-label="Eliminar modificador"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-1.5">
              <input
                placeholder="Nueva opción (ej. Leche light)"
                value={modForm.name}
                onChange={(e) => setModField(g.id, { name: e.target.value })}
                className="flex-1 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <input
                type="number"
                step="0.01"
                placeholder="+$0"
                value={modForm.priceAdd}
                onChange={(e) => setModField(g.id, { priceAdd: e.target.value })}
                className="w-20 px-2.5 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button
                type="button"
                onClick={() => addModifier(g.id)}
                disabled={savingMod === g.id || !modForm.name.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-black"
                style={{ background: "var(--gold)", color: "#000", opacity: savingMod === g.id || !modForm.name.trim() ? 0.5 : 1 }}
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
          className="rounded-xl border p-3 flex flex-col gap-2"
          style={{ background: "var(--surf2)", borderColor: "var(--gold)" }}
        >
          <input
            autoFocus
            placeholder="Nombre del grupo (ej. Tipo de leche)"
            value={groupForm.name}
            onChange={(e) => setGroupForm((p) => ({ ...p, name: e.target.value }))}
            className="px-2.5 py-1.5 rounded-lg text-sm outline-none"
            style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
            required
          />
          <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--muted)" }}>
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
            <label className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
              MIN
              <input
                type="number"
                min="0"
                value={groupForm.minSelection}
                onChange={(e) => setGroupForm((p) => ({ ...p, minSelection: e.target.value }))}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
              MAX
              <input
                type="number"
                min="0"
                value={groupForm.maxSelection}
                onChange={(e) => setGroupForm((p) => ({ ...p, maxSelection: e.target.value }))}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px]" style={{ color: "var(--muted)" }}>
              SIN COSTO N
              <input
                type="number"
                min="0"
                value={groupForm.freeModifiersLimit}
                onChange={(e) => setGroupForm((p) => ({ ...p, freeModifiersLimit: e.target.value }))}
                className="px-2 py-1.5 rounded-lg text-xs outline-none"
                style={{ background: "var(--surf)", border: "1px solid var(--border)", color: "var(--text)" }}
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
              className="flex-1 py-1.5 rounded-lg text-xs font-bold border"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingGroup}
              className="flex-1 py-1.5 rounded-lg text-xs font-black"
              style={{ background: "var(--gold)", color: "#000", opacity: savingGroup ? 0.5 : 1 }}
            >
              {editingGroupId ? "Actualizar" : "Crear grupo"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={openNewGroup}
          className="w-full py-2 rounded-xl text-xs font-bold border border-dashed transition-all"
          style={{ borderColor: "var(--gold)", color: "var(--gold)" }}
        >
          + Nuevo grupo de modificadores
        </button>
      )}
    </div>
  );
}
