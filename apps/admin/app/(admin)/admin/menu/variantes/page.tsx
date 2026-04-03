"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";

export default function VariantesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTemplate, setEditTemplate] = useState<any>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Opciones del template seleccionado
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [newOption, setNewOption] = useState({ name: '', price: '' });
  const [savingOption, setSavingOption] = useState(false);
  const [editingOption, setEditingOption] = useState<string|null>(null);
  const [editOptionForm, setEditOptionForm] = useState({ name: '', price: '' });

  async function fetchTemplates() {
    try {
      const { data } = await api.get("/api/menu/variant-templates");
      setTemplates(data);
      // Actualizar el template seleccionado si existe
      if (selectedTemplate) {
        const updated = data.find((t: any) => t.id === selectedTemplate.id);
        if (updated) setSelectedTemplate(updated);
      }
    } catch { }
    setLoading(false);
  }

  useEffect(() => { fetchTemplates(); }, []);

  async function saveTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editTemplate) {
        await api.put(`/api/menu/variant-templates/${editTemplate.id}`, { name });
      } else {
        const { data } = await api.post("/api/menu/variant-templates", { name, options: [] });
        setSelectedTemplate(data);
      }
      setShowForm(false);
      setName("");
      setEditTemplate(null);
      fetchTemplates();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  }

  async function deleteTemplate(id: string) {
    if (!confirm("¿Eliminar este grupo de variantes?")) return;
    try {
      await api.delete(`/api/menu/variant-templates/${id}`);
      if (selectedTemplate?.id === id) setSelectedTemplate(null);
      fetchTemplates();
    } catch { alert("Error al eliminar"); }
  }

  async function addOption() {
    if (!selectedTemplate || !newOption.name) return;
    setSavingOption(true);
    try {
      await api.post(`/api/menu/variant-templates/${selectedTemplate.id}/options`, {
        name: newOption.name,
        price: parseFloat(newOption.price) || 0,
      });
      setNewOption({ name: '', price: '' });
      fetchTemplates();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al agregar');
    } finally { setSavingOption(false); }
  }

  async function saveEditOption(id: string) {
    try {
      await api.put(`/api/menu/variant-templates/options/${id}`, {
        name: editOptionForm.name,
        price: parseFloat(editOptionForm.price) || 0,
      });
      setEditingOption(null);
      fetchTemplates();
    } catch { alert('Error al guardar'); }
  }

  async function deleteOption(id: string) {
    if (!confirm("¿Eliminar esta opción?")) return;
    try {
      await api.delete(`/api/menu/variant-templates/options/${id}`);
      fetchTemplates();
    } catch { alert('Error al eliminar'); }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/menu" className="text-sm font-bold" style={{color:"var(--muted)"}}>← Menú</Link>
          <div>
            <h1 className="font-syne text-3xl font-black">Grupos de Variantes</h1>
            <p className="text-sm mt-0.5" style={{color:"var(--muted)"}}>
              Crea grupos reutilizables y aplícalos a varios productos a la vez
            </p>
          </div>
        </div>
        <button onClick={() => { setEditTemplate(null); setName(""); setShowForm(true); }}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          + Nuevo grupo
        </button>
      </div>

      {/* Modal nombre */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.8)"}}>
          <div className="w-full max-w-sm rounded-2xl p-6 border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h2 className="font-syne font-black text-xl mb-5">
              {editTemplate ? "Editar grupo" : "Nuevo grupo de variantes"}
            </h2>
            <form onSubmit={saveTemplate} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>
                  Nombre del grupo
                </label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ej: Sabores Alitas, Tamaños, Carnes..."
                  required autoFocus
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black text-sm"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20" style={{color:"var(--muted)"}}>Cargando...</div>
      ) : (
        <div className="grid gap-6" style={{gridTemplateColumns: selectedTemplate ? "1fr 1.5fr" : "1fr"}}>

          {/* Lista de grupos */}
          <div className="flex flex-col gap-3">
            {templates.length === 0 && (
              <div className="text-center py-16 rounded-2xl border" style={{background:"var(--surf)",borderColor:"var(--border)",color:"var(--muted)"}}>
                <div className="text-4xl mb-3">🔀</div>
                <p className="font-bold mb-1">Sin grupos de variantes</p>
                <p className="text-xs">Crea grupos reutilizables como "Sabores Alitas" o "Tamaños"</p>
              </div>
            )}
            {templates.map(template => (
              <div key={template.id}
                className="rounded-2xl border p-4 cursor-pointer transition-all"
                style={{
                  background: selectedTemplate?.id === template.id ? "rgba(245,166,35,0.08)" : "var(--surf)",
                  borderColor: selectedTemplate?.id === template.id ? "var(--gold)" : "var(--border)",
                }}
                onClick={() => setSelectedTemplate(template)}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-syne font-black text-base">{template.name}</div>
                    <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>
                      {template.options.length} opciones
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={e => { e.stopPropagation(); setEditTemplate(template); setName(template.name); setShowForm(true); }}
                      className="px-2 py-1 rounded-lg text-xs"
                      style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)"}}>✏️</button>
                    <button onClick={e => { e.stopPropagation(); deleteTemplate(template.id); }}
                      className="px-2 py-1 rounded-lg text-xs"
                      style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>🗑️</button>
                  </div>
                </div>

                {/* Preview opciones */}
                {template.options.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {template.options.slice(0, 5).map((opt: any) => (
                      <span key={opt.id} className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{background:"var(--surf2)",color:"var(--muted)"}}>
                        {opt.name} {opt.price > 0 ? `$${opt.price}` : ''}
                      </span>
                    ))}
                    {template.options.length > 5 && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{color:"var(--muted)"}}>
                        +{template.options.length - 5} más
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Panel de edición del grupo seleccionado */}
          {selectedTemplate && (
            <div className="rounded-2xl border" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="px-5 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
                <div>
                  <h2 className="font-syne font-black text-lg">{selectedTemplate.name}</h2>
                  <p className="text-xs mt-0.5" style={{color:"var(--muted)"}}>
                    Edita las opciones de este grupo
                  </p>
                </div>
                <button onClick={() => setSelectedTemplate(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-xs"
                  style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
              </div>

              <div className="p-5">
                {/* Header tabla */}
                <div className="grid grid-cols-12 gap-2 px-3 pb-2 text-xs font-black uppercase tracking-wider" style={{color:"var(--muted)"}}>
                  <span className="col-span-6">Opción</span>
                  <span className="col-span-3 text-right">Precio</span>
                  <span className="col-span-3"></span>
                </div>

                {/* Opciones */}
                <div className="flex flex-col gap-1 mb-4">
                  {selectedTemplate.options.length === 0 && (
                    <p className="text-sm text-center py-6" style={{color:"var(--muted)"}}>
                      Sin opciones aún — agrega la primera abajo
                    </p>
                  )}
                  {selectedTemplate.options.map((opt: any) => (
                    <div key={opt.id}>
                      {editingOption === opt.id ? (
                        <div className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl"
                          style={{background:"var(--surf2)",border:"1.5px solid var(--gold)"}}>
                          <input value={editOptionForm.name}
                            onChange={e => setEditOptionForm(p => ({...p, name: e.target.value}))}
                            className="col-span-6 px-2 py-1.5 rounded-lg text-sm outline-none"
                            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                          <div className="col-span-3 flex items-center gap-1">
                            <span className="text-xs" style={{color:"var(--muted)"}}>$</span>
                            <input value={editOptionForm.price} type="number"
                              onChange={e => setEditOptionForm(p => ({...p, price: e.target.value}))}
                              className="w-full px-2 py-1.5 rounded-lg text-sm outline-none text-right"
                              style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                          </div>
                          <div className="col-span-3 flex gap-1 justify-end">
                            <button onClick={() => saveEditOption(opt.id)}
                              className="px-2 py-1.5 rounded-lg text-xs font-black"
                              style={{background:"var(--gold)",color:"#000"}}>✓</button>
                            <button onClick={() => setEditingOption(null)}
                              className="px-2 py-1.5 rounded-lg text-xs"
                              style={{background:"var(--surf)",color:"var(--muted)",border:"1px solid var(--border)"}}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-2 items-center px-3 py-2.5 rounded-xl group transition-all"
                          style={{background:"var(--surf2)"}}>
                          <span className="col-span-6 text-sm font-medium">{opt.name}</span>
                          <span className="col-span-3 text-sm font-bold text-right" style={{color:"var(--gold)"}}>
                            {opt.price > 0 ? `$${opt.price}` : 'Gratis'}
                          </span>
                          <div className="col-span-3 flex gap-1 justify-end">
                            <button onClick={() => { setEditingOption(opt.id); setEditOptionForm({ name: opt.name, price: String(opt.price) }); }}
                              className="px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{background:"rgba(245,166,35,0.15)",color:"var(--gold)"}}>✏️</button>
                            <button onClick={() => deleteOption(opt.id)}
                              className="px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>🗑️</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Agregar opción */}
                <div className="border-t pt-4" style={{borderColor:"var(--border)"}}>
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{color:"var(--muted)"}}>
                    Agregar opción
                  </p>
                  <div className="flex gap-2">
                    <input value={newOption.name} onChange={e => setNewOption(p=>({...p,name:e.target.value}))}
                      placeholder="Ej: Hawaiana, BBQ, Arrachera..."
                      className="flex-1 px-3 py-2 rounded-xl text-xs outline-none"
                      style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    <div className="flex items-center gap-1 w-24">
                      <span className="text-xs" style={{color:"var(--muted)"}}>$</span>
                      <input value={newOption.price} onChange={e => setNewOption(p=>({...p,price:e.target.value}))}
                        placeholder="0.00" type="number"
                        className="w-full px-2 py-2 rounded-xl text-xs outline-none"
                        style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                    <button onClick={addOption} disabled={savingOption || !newOption.name}
                      className="px-3 py-2 rounded-xl text-xs font-black whitespace-nowrap"
                      style={{background:"var(--gold)",color:"#000"}}>
                      {savingOption ? "..." : "+ Agregar"}
                    </button>
                  </div>
                </div>

                {/* Info de uso */}
                <div className="mt-4 px-4 py-3 rounded-xl text-xs" style={{background:"rgba(59,130,246,0.08)",color:"#3b82f6",border:"1px solid rgba(59,130,246,0.2)"}}>
                  💡 Para aplicar este grupo a un producto, ve a <strong>Menú → Editar producto → Variantes → Aplicar grupo</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}