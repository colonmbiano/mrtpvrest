"use client";
import { useEffect, useState } from "react";
import {
  Plus, X, Pencil, Trash2, Check, Shuffle, Info, ChevronLeft,
} from "lucide-react";
import api from "@/lib/api";
import {
  PageShell, PageHeader, PageTabs, Card, Modal, Button, Pill, EmptyState,
  SectionLabel, Field, Input, useToast, useConfirm,
} from "@/components/ds";
import { formatMoney } from "@/lib/format";

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
  const toast = useToast();
  const confirm = useConfirm();

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
      toast.error(e.response?.data?.error || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    if (!(await confirm({ title: "¿Eliminar este grupo de variantes?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/menu/variant-templates/${id}`);
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
      fetchTemplates();
    } catch {
      toast.error("Error al eliminar");
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
      toast.error(e.response?.data?.error || "Error al agregar");
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
      toast.error("Error al guardar");
    }
  }

  async function deleteOption(id: string) {
    if (!(await confirm({ title: "¿Eliminar esta opción?", danger: true, confirmLabel: "Eliminar" }))) return;
    try {
      await api.delete(`/api/menu/variant-templates/options/${id}`);
      fetchTemplates();
    } catch {
      toast.error("Error al eliminar");
    }
  }

  function openNewForm() {
    setEditTemplate(null);
    setName("");
    setShowForm(true);
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Menú"
        title="Grupos de variantes"
        subtitle="Crea grupos reutilizables y aplícalos a varios productos a la vez"
        actions={
          <Button icon={Plus} onClick={openNewForm}>Nuevo grupo</Button>
        }
      />

      <PageTabs set="menu" />

      {/* mobile back + action */}
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <Button variant="secondary" href="/admin/menu" icon={ChevronLeft}>Menú</Button>
        <Button icon={Plus} onClick={openNewForm}>Nuevo grupo</Button>
      </div>

      {/* Modal nombre */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editTemplate ? "Editar grupo" : "Nuevo grupo de variantes"} size="sm">
        <form onSubmit={saveTemplate} className="flex flex-col gap-4">
          <Field label="Nombre del grupo">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Sabores Alitas, Tamaños, Carnes…"
              required
              autoFocus
            />
          </Field>
          <div className="flex gap-3">
            <Button variant="secondary" full onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button type="submit" full disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
          </div>
        </form>
      </Modal>

      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-ds-xl bg-surf-2" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:gap-6" style={{ gridTemplateColumns: selectedTemplate ? undefined : "1fr" }}>
          <div className={selectedTemplate ? "grid gap-4 md:grid-cols-[1fr_1.5fr] md:gap-6" : ""}>
            {/* Lista de grupos */}
            <div className="flex flex-col gap-3">
              {templates.length === 0 && (
                <EmptyState
                  icon={Shuffle}
                  title="Sin grupos de variantes"
                  hint='Crea grupos reutilizables como "Sabores Alitas" o "Tamaños".'
                  action={
                    <Button icon={Plus} onClick={openNewForm}>Nuevo grupo</Button>
                  }
                />
              )}
              {templates.map((template) => {
                const active = selectedTemplate?.id === template.id;
                return (
                  <Card
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className="p-4"
                    style={active ? { background: "var(--accent-soft)", borderColor: "var(--brand-primary)" } : undefined}
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
                          className="grid h-9 w-9 place-items-center rounded-ds-md text-primary"
                          style={{ background: "var(--accent-soft)" }}
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
                          className="grid h-9 w-9 place-items-center rounded-ds-md"
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
                            {opt.price > 0 ? ` ${formatMoney(opt.price)}` : ""}
                          </Pill>
                        ))}
                        {template.options.length > 5 && (
                          <span className="self-center text-[11px] text-tx-mut">
                            +{template.options.length - 5} más
                          </span>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {/* Panel de edición del grupo seleccionado */}
            {selectedTemplate && (
              <Card className="flex flex-col p-0">
                <div className="flex items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--bd-1)" }}>
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
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-ds-md text-tx-mut"
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
                          className="flex items-center gap-2 rounded-ds-md p-2"
                          style={{ background: "var(--surf-2)", border: "1.5px solid var(--brand-primary)" }}
                        >
                          <input
                            value={editOptionForm.name}
                            onChange={(e) => setEditOptionForm((p) => ({ ...p, name: e.target.value }))}
                            className="min-h-10 min-w-0 flex-1 rounded-ds-sm px-2 text-sm outline-none"
                            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                          />
                          <div className="flex w-24 shrink-0 items-center gap-1">
                            <span className="text-xs text-tx-mut">$</span>
                            <input
                              value={editOptionForm.price}
                              type="number"
                              onChange={(e) => setEditOptionForm((p) => ({ ...p, price: e.target.value }))}
                              className="min-h-10 w-full rounded-ds-sm px-2 text-right text-sm outline-none"
                              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                            />
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => saveEditOption(opt.id)}
                              aria-label="Guardar"
                              className="grid h-10 w-10 place-items-center rounded-ds-sm"
                              style={{ background: "var(--brand-primary)", color: "var(--accent-contrast)" }}
                            >
                              <Check size={15} strokeWidth={2.4} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingOption(null)}
                              aria-label="Cancelar"
                              className="grid h-10 w-10 place-items-center rounded-ds-sm text-tx-mut"
                              style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                            >
                              <X size={15} />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          key={opt.id}
                          className="flex items-center gap-2 rounded-ds-md px-3 py-2.5"
                          style={{ background: "var(--surf-2)" }}
                        >
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-tx">
                            {opt.name}
                          </span>
                          <span className="shrink-0 text-sm font-bold text-primary">
                            {opt.price > 0 ? formatMoney(opt.price) : "Gratis"}
                          </span>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              aria-label="Editar opción"
                              onClick={() => {
                                setEditingOption(opt.id);
                                setEditOptionForm({ name: opt.name, price: String(opt.price) });
                              }}
                              className="grid h-9 w-9 place-items-center rounded-ds-sm text-primary"
                              style={{ background: "var(--accent-soft)" }}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              aria-label="Eliminar opción"
                              onClick={() => deleteOption(opt.id)}
                              className="grid h-9 w-9 place-items-center rounded-ds-sm"
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
                        className="min-h-11 min-w-[140px] flex-1 rounded-ds-md px-3 text-sm outline-none"
                        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                      />
                      <div className="flex w-24 items-center gap-1">
                        <span className="text-xs text-tx-mut">$</span>
                        <input
                          value={newOption.price}
                          onChange={(e) => setNewOption((p) => ({ ...p, price: e.target.value }))}
                          placeholder="0.00"
                          type="number"
                          className="min-h-11 w-full rounded-ds-md px-2 text-sm outline-none"
                          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
                        />
                      </div>
                      <Button icon={Plus} onClick={addOption} disabled={savingOption || !newOption.name}>
                        {savingOption ? "…" : "Agregar"}
                      </Button>
                    </div>
                  </div>

                  {/* Info de uso */}
                  <div className="mt-4 flex items-start gap-2 rounded-ds-md px-4 py-3 text-xs" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
                    <Info size={15} className="mt-0.5 shrink-0" />
                    <span>
                      Para aplicar este grupo a un producto, ve a{" "}
                      <strong>Menú → Editar producto → Variantes → Aplicar grupo</strong>
                    </span>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}
    </PageShell>
  );
}
