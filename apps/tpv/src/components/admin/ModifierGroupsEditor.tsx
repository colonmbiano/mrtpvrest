"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Plus, Trash2 } from "lucide-react";

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
  const [modForms, setModForms] = useState<Record<string, { name: string; priceAdd: string; isDefault: boolean }>>({});
  const [savingMod, setSavingMod] = useState<string | null>(null);

  async function fetchGroups() {
    setLoading(true);
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
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && itemId) fetchGroups();
    });
    return () => { cancelled = true; };
  }, [itemId]);

  function openNewGroup() {
    setEditingGroupId(null);
    setGroupForm(emptyGroupForm);
    setShowGroupForm(true);
  }

  function openEditGroup(group: ModifierGroup) {
    setEditingGroupId(group.id);
    setGroupForm({
      name: group.name,
      required: group.required,
      multiSelect: group.multiSelect,
      minSelection: String(group.minSelection),
      maxSelection: String(group.maxSelection),
      freeModifiersLimit: String(group.freeModifiersLimit),
    });
    setShowGroupForm(true);
  }

  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!groupForm.name.trim()) return;
    setSavingGroup(true);
    const payload = {
      name: groupForm.name.trim(),
      required: groupForm.required,
      multiSelect: groupForm.multiSelect,
      minSelection: parseInt(groupForm.minSelection, 10) || 0,
      maxSelection: parseInt(groupForm.maxSelection, 10) || 0,
      freeModifiersLimit: parseInt(groupForm.freeModifiersLimit, 10) || 0,
    };
    try {
      if (editingGroupId) {
        await api.put(`/api/menu/modifier-groups/${editingGroupId}`, payload);
      } else {
        await api.post(`/api/menu/items/${itemId}/modifier-groups`, payload);
      }
      setShowGroupForm(false);
      setEditingGroupId(null);
      setGroupForm(emptyGroupForm);
      await fetchGroups();
    } finally {
      setSavingGroup(false);
    }
  }

  async function deleteGroup(id: string) {
    if (!confirm("Eliminar este grupo y todos sus modificadores?")) return;
    await api.delete(`/api/menu/modifier-groups/${id}`);
    await fetchGroups();
  }

  function setModField(groupId: string, patch: Partial<{ name: string; priceAdd: string; isDefault: boolean }>) {
    setModForms((prev) => ({
      ...prev,
      [groupId]: { name: "", priceAdd: "0", isDefault: false, ...prev[groupId], ...patch },
    }));
  }

  async function addModifier(groupId: string) {
    const form = modForms[groupId];
    if (!form?.name?.trim()) return;
    setSavingMod(groupId);
    try {
      await api.post(`/api/menu/modifier-groups/${groupId}/modifiers`, {
        name: form.name.trim(),
        priceAdd: parseFloat(form.priceAdd) || 0,
        isDefault: !!form.isDefault,
      });
      setModForms((prev) => ({ ...prev, [groupId]: { name: "", priceAdd: "0", isDefault: false } }));
      await fetchGroups();
    } finally {
      setSavingMod(null);
    }
  }

  async function updateModifierField(modifier: Modifier, patch: Partial<{ name: string; priceAdd: number; isDefault: boolean }>) {
    await api.put(`/api/menu/modifiers/${modifier.id}`, patch);
    await fetchGroups();
  }

  async function deleteModifier(modifierId: string) {
    if (!confirm("Eliminar este modificador?")) return;
    await api.delete(`/api/menu/modifiers/${modifierId}`);
    await fetchGroups();
  }

  if (loading) {
    return <p className="text-xs text-zinc-500">Cargando modificadores...</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.length === 0 && !showGroupForm && (
        <p className="text-xs text-zinc-500">
          Sin modificadores. Agrega grupos como Tipo de leche, Sin azucar o Termino.
        </p>
      )}

      {groups.map((group) => {
        const form = modForms[group.id] || { name: "", priceAdd: "0", isDefault: false };
        return (
          <div key={group.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">{group.name}</p>
                <p className="text-[11px] font-bold text-zinc-500">
                  {group.multiSelect ? "Multiple" : "Unica"}
                  {group.required ? " · obligatorio" : " · opcional"}
                  {group.maxSelection > 0 ? ` · max ${group.maxSelection}` : ""}
                  {group.freeModifiersLimit > 0 ? ` · ${group.freeModifiersLimit} gratis` : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => openEditGroup(group)} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">
                  Editar
                </button>
                <button type="button" onClick={() => deleteGroup(group.id)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-black uppercase text-red-400">
                  Borrar
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {group.modifiers.map((modifier) => (
                <div key={modifier.id} className="grid grid-cols-[1fr_88px_auto_auto] items-center gap-2 rounded-xl bg-[#0a0a0c] p-2">
                  <input
                    defaultValue={modifier.name}
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== modifier.name) updateModifierField(modifier, { name: next });
                    }}
                    className="min-w-0 bg-transparent px-2 text-sm font-bold text-white outline-none"
                  />
                  <input
                    type="number"
                    step="0.01"
                    defaultValue={modifier.priceAdd}
                    onBlur={(e) => {
                      const next = parseFloat(e.target.value) || 0;
                      if (next !== modifier.priceAdd) updateModifierField(modifier, { priceAdd: next });
                    }}
                    className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-right text-xs text-white outline-none"
                  />
                  <label className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500">
                    <input
                      type="checkbox"
                      checked={modifier.isDefault}
                      onChange={(e) => updateModifierField(modifier, { isDefault: e.target.checked })}
                    />
                    Default
                  </label>
                  <button type="button" onClick={() => deleteModifier(modifier.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-400">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_90px_44px] gap-2">
              <input
                placeholder="Nueva opcion"
                value={form.name}
                onChange={(e) => setModField(group.id, { name: e.target.value })}
                className="rounded-xl border border-white/10 bg-[#0a0a0c] px-3 py-2 text-sm text-white outline-none"
              />
              <input
                type="number"
                step="0.01"
                placeholder="+$0"
                value={form.priceAdd}
                onChange={(e) => setModField(group.id, { priceAdd: e.target.value })}
                className="rounded-xl border border-white/10 bg-[#0a0a0c] px-3 py-2 text-sm text-white outline-none"
              />
              <button
                type="button"
                onClick={() => addModifier(group.id)}
                disabled={savingMod === group.id || !form.name.trim()}
                className="flex items-center justify-center rounded-xl bg-iris-500 text-iris-fg disabled:opacity-40"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        );
      })}

      {showGroupForm ? (
        <form onSubmit={saveGroup} className="rounded-2xl border border-iris-glow bg-iris-soft p-4">
          <input
            autoFocus
            placeholder="Nombre del grupo"
            value={groupForm.name}
            onChange={(e) => setGroupForm((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full rounded-xl border border-white/10 bg-[#0a0a0c] px-3 py-3 text-sm font-bold text-white outline-none"
            required
          />
          <div className="mt-3 grid grid-cols-2 gap-3 text-xs font-bold text-zinc-400">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groupForm.required} onChange={(e) => setGroupForm((prev) => ({ ...prev, required: e.target.checked }))} />
              Obligatorio
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={groupForm.multiSelect} onChange={(e) => setGroupForm((prev) => ({ ...prev, multiSelect: e.target.checked }))} />
              Multiple
            </label>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {([
              ["Min", "minSelection"],
              ["Max", "maxSelection"],
              ["Gratis", "freeModifiersLimit"],
            ] as const).map(([label, key]) => (
              <label key={key} className="text-[10px] font-black uppercase text-zinc-500">
                {label}
                <input
                  type="number"
                  min="0"
                  value={groupForm[key as keyof GroupForm] as string}
                  onChange={(e) => setGroupForm((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#0a0a0c] px-3 py-2 text-sm text-white outline-none"
                />
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button type="button" onClick={() => setShowGroupForm(false)} className="flex-1 rounded-xl border border-white/10 py-3 text-xs font-black uppercase text-zinc-400">
              Cancelar
            </button>
            <button type="submit" disabled={savingGroup} className="flex-1 rounded-xl bg-iris-500 py-3 text-xs font-black uppercase text-iris-fg disabled:opacity-40">
              {editingGroupId ? "Actualizar" : "Crear"}
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={openNewGroup} className="rounded-2xl border border-dashed border-iris-glow py-3 text-xs font-black uppercase tracking-[0.18em] text-iris-500">
          + Nuevo grupo de modificadores
        </button>
      )}
    </div>
  );
}
