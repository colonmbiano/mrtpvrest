"use client";
import { useEffect, useState } from "react";
import {
  Plus, X, Pencil, Trash2, Check, Shuffle, Info, ChevronLeft,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, PrimaryBtn, Pill, EmptyState,
  SectionLabel, money,
} from "@/components/warmtech";

interface VariantOption {
  id: string;
  name: string;
  price: number;
}
interface VariantTemplate {
  id: string;
  name: string;
  options: VariantOption[];
}

export default function VariantesPage() {
  const [templates, setTemplates] = useState<VariantTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState<VariantTemplate | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Opciones del template seleccionado
  const [selectedTemplate, setSelectedTemplate] = useState<VariantTemplate | null>(null);
  const [newOption, setNewOption] = useState({ name: "", price: "" });
  const [savingOption, setSavingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<string | null>(null);
  const [editOptionForm, setEditOptionForm] = useState({ name: "", price: "" });

  async function fetchTemplates() {
    try {
      const { data } = await api.get<VariantTemplate[]>("/api/menu/variant-templates");
      setTemplates(data);
      // Actualizar el template seleccionado si existe
      if (selectedTemplate) {
        const updated = data.find((t) => t.id === selectedTemplate.id);
        if (updated) setSelectedTemplate(updated);
      }
    } catch {
      /* noop */
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editTemplate) {
        await api.put(`/api/menu/variant-templates/${editTemplate.id}`, { name });
      } else {
        const { data } = await api.post<VariantTemplate>("/api/menu/variant-templates", {
          name,
          options: [],
        });
        setSelectedTemplate(data);
      }
      setShowForm(false);
      setName("");
      setEditTemplate(null);
      fetchTemplates();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Eliminar este grupo de variantes?")) return;
    try {
      await api.delete(`/api/menu/variant-templates/${id}`);
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
      fetchTemplates();
    } catch {
      alert("Error al eliminar");
    }
  }

  async function addOption() {
    if (!selectedTemplate || !newOption.name) return;
    setSavingOption(true);
    try {
      await api.post(`/api/menu/variant-templates/${selectedTemplate.id}/options`, {
        name: newOption.name,
        price: parseFloat(newOption.price) || 0,
      });
      setNewOption({ name: "", price: "" });
      fetchTemplates();
    } catch (err) {
      const e = err as { response?: { data?: { error?: string } } };
      alert(e.response?.data?.error || "Error al agregar");
    } finally {
      setSavingOption(false);
    }
  }

  async function saveEditOption(id: string) {
    try {
      await api.put(`/api/menu/variant-templates/options/${id}`, {
        name: editOptionForm.name,
        price: parseFloat(editOptionForm.price) || 0,
      });
      setEditingOption(null);
      fetchTemplates();
    } catch {
      alert("Error al guardar");
    }
  }

  async function deleteOption(id: string) {
    if (!confirm("¿Eliminar esta opción?")) return;
    try {
      await api.delete(`/api/menu/variant-templates/options/${id}`);
      fetchTemplates();
    } catch {
      alert("Error al eliminar");
    }
  }

  function openNewForm() {
    setEditTemplate(null);
    setName("");
    setShowForm(true);
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Menú"
        title="Grupos de variantes"
        subtitle="Crea grupos reutilizables y aplícalos a varios productos a la vez"
        actions={
          <PrimaryBtn full={false} icon={Plus} onClick={openNewForm}>
            Nuevo grupo
          </PrimaryBtn>
        }
      />

      {/* mobile back + action */}
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <PrimaryBtn full={false} ghost href="/admin/menu" icon={ChevronLeft}>
          Menú
        </PrimaryBtn>
        <PrimaryBtn full={false} icon={Plus} onClick={openNewForm}>
          Nuevo grupo
        </PrimaryBtn>
      </div>

      {/* Modal nombre */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
          style={{ background: "rgba(0,0,0,0.7)" }}
        >
          <WtCard className="w-full max-w-sm p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-xl font-extrabold text-tx-hi">
                {editTemplate ? "Editar grupo" : "Nuevo grupo de variantes"}
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Cerrar"
                className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={saveTemplate} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block font-mono text-[9.5px] uppercase tracking-[.12em] text-tx-mut">
                  Nombre del grupo
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Sabores Alitas, Tamaños, Carnes…"
                  required
                  autoFocus
                  className="min-h-12 w-full rounded-xl px-4 text-sm outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                />
              </div>
              <div className="flex gap-3">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>
                  Cancelar
                </PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[18px] bg-surf-2" />
          ))}
        </div>
      ) : (
        <div
          className="grid gap-4 md:gap-6"
          style={{ gridTemplateColumns: selectedTemplate ? undefined : "1fr" }}
        >
          <div className={selectedTemplate ? "grid gap-4 md:grid-cols-[1fr_1.5fr] md:gap-6" : ""}>
            {/* Lista de grupos */}
            <div className="flex flex-col gap-3">
              {templates.length === 0 && (
                <EmptyState
                  icon={Shuffle}
                  title="Sin grupos de variantes"
                  hint='Crea grupos reutilizables como "Sabores Alitas" o "Tamaños".'
                  action={
                    <PrimaryBtn full={false} icon={Plus} onClick={openNewForm}>
                      Nuevo grupo
                    </PrimaryBtn>
                  }
                />
              )}
              {templates.map((template) => {
                const active = selectedTemplate?.id === template.id;
                return (
                  <WtCard
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className="p-4"
                    style={
                      active
                        ? { background: "var(--iris-soft)", borderColor: "var(--brand-primary)" }
                        : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-display text-base font-extrabold text-tx-hi">
                          {template.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-tx-mut">
                          {template.options.length} opciones
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          aria-label="Editar grupo"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditTemplate(template);
                            setName(template.name);
                            setShowForm(true);
                          }}
                          className="grid h-9 w-9 place-items-center rounded-xl text-primary"
                          style={{ background: "var(--iris-soft)" }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          aria-label="Eliminar grupo"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteTemplate(template.id);
                          }}
                          className="grid h-9 w-9 place-items-center rounded-xl"
                          style={{ background: "var(--err-soft)", color: "var(--err)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Preview opciones */}
                    {template.options.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {template.options.slice(0, 5).map((opt) => (
                          <Pill key={opt.id} tone="neutral">
                            {opt.name}
                            {opt.price > 0 ? ` ${money(opt.price)}` : ""}
                          </Pill>
                        ))}
                        {template.options.length > 5 && (
                          <span className="self-center text-[11px] text-tx-mut">
                            +{template.options.length - 5} más
                          </span>
                        )}
                      </div>
                    )}
                  </WtCard>
                );
              })}
            </div>

            {/* Panel de edición del grupo seleccionado */}
            {selectedTemplate && (
              <WtCard className="flex flex-col p-0">
                <div
                  className="flex items-center justify-between gap-3 px-5 py-4"
                  style={{ borderBottom: "1px solid var(--bd-1)" }}
                >
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg font-extrabold text-tx-hi">
                      {selectedTemplate.name}
                    </h2>
                    <p className="text-[11px] text-tx-mut">Edita las opciones de este grupo</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedTemplate(null)}
                    aria-label="Cerrar"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-tx-mut"
                    style={{ background: "var(--surf-2)" }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="p-5">
                  <SectionLabel>Opciones</SectionLabel>

                  {/* Opciones */}
                  <div className="mb-4 flex flex-col gap-1.5">
                    {selectedTemplate.options.length === 0 && (
                      <p className="py-6 text-center text-sm text-tx-mut">
                        Sin opciones aún — agrega la primera abajo
                      </p>
                    )}
                    {selectedTemplate.options.map((opt) =>
                      editingOption === opt.id ? (
                        <div
                          key={opt.id}
                          className="flex items-center gap-2 rounded-xl p-2"
                          style={{ background: "var(--surf-2)", border: "1.5px solid var(--brand-primary)" }}
                        >
                          <input
                            value={editOptionForm.name}
                            onChange={(e) => setEditOptionForm((p) => ({ ...p, name: e.target.value }))}
                            className="min-h-10 min-w-0 flex-1 rounded-lg px-2 text-sm outline-none"
                            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          />
                          <div className="flex w-24 shrink-0 items-center gap-1">
                            <span className="text-xs text-tx-mut">$</span>
                            <input
                              value={editOptionForm.price}
                              type="number"
                              onChange={(e) => setEditOptionForm((p) => ({ ...p, price: e.target.value }))}
                              className="min-h-10 w-full rounded-lg px-2 text-right text-sm outline-none"
                              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                            />
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => saveEditOption(opt.id)}
                              aria-label="Guardar"
                              className="grid h-10 w-10 place-items-center rounded-lg text-white"
                              style={{ background: "var(--brand-primary)" }}
                            >
                              <Check size={15} strokeWidth={2.4} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingOption(null)}
                              aria-label="Cancelar"
                              className="grid h-10 w-10 place-items-center rounded-lg text-tx-mut"
                              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={opt.id}
                          className="flex items-center gap-2 rounded-xl px-3 py-2.5"
                          style={{ background: "var(--surf-2)" }}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-tx">
                            {opt.name}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-primary">
                            {opt.price > 0 ? money(opt.price) : "Gratis"}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              aria-label="Editar opción"
                              onClick={() => {
                                setEditingOption(opt.id);
                                setEditOptionForm({ name: opt.name, price: String(opt.price) });
                              }}
                              className="grid h-9 w-9 place-items-center rounded-lg text-primary"
                              style={{ background: "var(--iris-soft)" }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label="Eliminar opción"
                              onClick={() => deleteOption(opt.id)}
                              className="grid h-9 w-9 place-items-center rounded-lg"
                              style={{ background: "var(--err-soft)", color: "var(--err)" }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ),
                    )}
                  </div>

                  {/* Agregar opción */}
                  <div className="pt-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
                    <SectionLabel>Agregar opción</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={newOption.name}
                        onChange={(e) => setNewOption((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Ej: Hawaiana, BBQ, Arrachera…"
                        className="min-h-11 min-w-[140px] flex-1 rounded-xl px-3 text-sm outline-none"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                      />
                      <div className="flex w-24 items-center gap-1">
                        <span className="text-xs text-tx-mut">$</span>
                        <input
                          value={newOption.price}
                          onChange={(e) => setNewOption((p) => ({ ...p, price: e.target.value }))}
                          placeholder="0.00"
                          type="number"
                          className="min-h-11 w-full rounded-xl px-2 text-sm outline-none"
                          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                        />
                      </div>
                      <PrimaryBtn
                        full={false}
                        icon={Plus}
                        onClick={addOption}
                        disabled={savingOption || !newOption.name}
                      >
                        {savingOption ? "…" : "Agregar"}
                      </PrimaryBtn>
                    </div>
                  </div>

                  {/* Info de uso */}
                  <div
                    className="mt-4 flex items-start gap-2 rounded-xl px-4 py-3 text-xs"
                    style={{ background: "var(--info-soft)", color: "var(--info)" }}
                  >
                    <Info size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Para aplicar este grupo a un producto, ve a{" "}
                      <strong>Menú → Editar producto → Variantes → Aplicar grupo</strong>
                    </span>
                  </div>
                </div>
              </WtCard>
            )}
          </div>
        </div>
      )}
    </WtScreen>
  );
}
