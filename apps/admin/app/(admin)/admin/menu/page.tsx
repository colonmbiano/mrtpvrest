"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import ModifierGroupsEditor from "@/components/admin/ModifierGroupsEditor";
import { uploadMenuImage } from "@/lib/supabaseUpload";
import { extractErrorMessage } from "@/lib/errors";

// ── Componente para aplicar grupo de variantes ────────────────────────────
function ApplyTemplateButton({ itemId, onApplied }: { itemId: string, onApplied: (v: any[]) => void }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [applying, setApplying] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) api.get("/api/menu/variant-templates").then(r => setTemplates(r.data));
  }, [open]);

  async function apply(templateId: string) {
    setApplying(true);
    try {
      const { data } = await api.post(`/api/menu/items/${itemId}/apply-template/${templateId}`);
      onApplied(data.variants);
      setOpen(false);
    } catch { alert("Error al aplicar grupo"); }
    finally { setApplying(false); }
  }

  return (
    <div className="mb-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)}
          className="w-full py-2 rounded-xl text-xs font-bold border border-dashed transition-all"
          style={{borderColor:"var(--gold)",color:"var(--gold)"}}>
          🔀 Aplicar grupo de variantes
        </button>
      ) : (
        <div className="rounded-xl border p-3" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
          <p className="text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Selecciona un grupo:</p>
          {templates.length === 0 ? (
            <p className="text-xs" style={{color:"var(--muted)"}}>Sin grupos creados. Ve a Menú → Variantes</p>
          ) : (
            <div className="flex flex-col gap-1">
              {templates.map((t: any) => (
                <button key={t.id} type="button" onClick={() => apply(t.id)} disabled={applying}
                  className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-left transition-all"
                  style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
                  <span className="font-bold">{t.name}</span>
                  <span className="text-xs" style={{color:"var(--muted)"}}>{t.options?.length || 0} opciones</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)}
            className="mt-2 text-xs" style={{color:"var(--muted)"}}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export default function MenuPage() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [variantTemplates, setVariantTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, activeDays:[] as string[], variantTemplateIds:[] as string[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0 });
  const [imageFile, setImageFile] = useState<File|null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Drill-down: la vista por defecto muestra categorías como tiles. Al
  // clickear una entras a 'products' filtrado por esa categoría. La
  // búsqueda al tipear conmuta automáticamente a vista plana de items.
  const [view, setView] = useState<"categories" | "products">("categories");
  const [drillCategoryId, setDrillCategoryId] = useState<string | null>(null);

  // IA Escaneo
  const [scanState, setScanState] = useState<{
    active: boolean; currentFile: string; current: number; total: number; error: string | null;
  }>({ active: false, currentFile: '', current: 0, total: 0, error: null });

  // Complementos
  const [complements, setComplements] = useState<any[]>([]);
  const [newComp, setNewComp] = useState({ name: '', price: '' });
  const [savingComp, setSavingComp] = useState(false);
  const [editingComp, setEditingComp] = useState<string|null>(null);
  const [editCompForm, setEditCompForm] = useState({ name: '', price: '' });

  // Variantes
  const [variants, setVariants] = useState<any[]>([]);
  const [newVariant, setNewVariant] = useState({ name: '', price: '' });
  const [savingVariant, setSavingVariant] = useState(false);
  const [editingVariant, setEditingVariant] = useState<string|null>(null);
  const [editVariantForm, setEditVariantForm] = useState({ name: '', price: '' });
  const [activeTab, setActiveTab] = useState<'complements'|'variants'>('variants');

  // Crear categoría al vuelo (inline en el modal de platillo)
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [creatingCat, setCreatingCat] = useState(false);

  // Wipe del menú (zona de peligro)
  const [showWipe, setShowWipe] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState("");
  const [wiping, setWiping] = useState(false);

  async function fetchData() {
    try {
      const [i, c, vt] = await Promise.all([
        api.get("/api/menu/items"),
        api.get("/api/menu/categories"),
        api.get("/api/menu/variant-templates"),
      ]);
      setItems(Array.isArray(i.data) ? i.data : []);
      setCats(Array.isArray(c.data) ? c.data : []);
      setVariantTemplates(Array.isArray(vt.data) ? vt.data : []);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { fetchData(); }, []);

  // ── IA: Escanear Menú ────────────────────────────────────────────────────
  async function handleAIScan(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileNames = Array.from(files).map(f => f.name);
    setScanState({ active: true, currentFile: fileNames[0] ?? '', current: 1, total: files.length, error: null });

    // Cicla entre los nombres de archivo mientras espera la respuesta de la IA
    let fileIdx = 0;
    const cycleInterval = setInterval(() => {
      fileIdx = (fileIdx + 1) % fileNames.length;
      setScanState(p => (!p.error ? { ...p, currentFile: fileNames[fileIdx] ?? '', current: fileIdx + 1 } : p));
    }, 1200);

    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        if (f) fd.append("images", f);
      }

      // Bypass Vercel 4.5MB rewrite limit by hitting the backend directly
      const { data } = await api.post(`${getApiUrl()}/api/ai/scan-menu`, fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      clearInterval(cycleInterval);
      const { categories: aiCats, items: aiItems, global_modifiers: aiGlobalModifiers } = data.data;

      // Fase 2: importar categorías
      setScanState(p => ({ ...p, currentFile: 'Creando categorías...', current: 0, total: aiItems?.length || 0 }));
      const currentCats = [...cats];
      if (aiCats) {
        for (const catName of aiCats) {
          const exists = currentCats.find(c => c.name.toLowerCase() === catName.toLowerCase());
          if (!exists) {
            try { const res = await api.post("/api/menu/categories", { name: catName }); currentCats.push(res.data); }
            catch (err) { console.error("Error creando categoria IA", err); }
          }
        }
      }

      // Fase 3: importar platillos con progreso
      if (aiItems) {
        for (let i = 0; i < aiItems.length; i++) {
          const item = aiItems[i];
          setScanState(p => ({ ...p, currentFile: item.name, current: i + 1 }));
          const category = currentCats.find(c => c.name.toLowerCase() === (item.category || "").toLowerCase());
          
          // El precio base ahora viene del primer base_options o es 0 si no hay
          const basePrice = item.base_options && item.base_options.length > 0 ? (item.base_options[0].price || 0) : 0;
          
          try {
            const { data: createdItem } = await api.post("/api/menu/items", {
              name: item.name, description: item.description,
              price: basePrice, categoryId: category?.id || currentCats[0]?.id, isPopular: !!item.pantalla_principal
            });
            
            // Importar base_options como variantes
            if (item.base_options && item.base_options.length > 0) {
              for (const v of item.base_options) {
                await api.post(`/api/menu/${createdItem.id}/variants`, {
                  name: v.name, price: v.price || 0
                }).catch(e => console.error("Error creando variante IA", e));
              }
            }
            
            // Importar allowed_modifiers buscando en global_modifiers
            if (item.allowed_modifiers && item.allowed_modifiers.length > 0 && aiGlobalModifiers) {
              for (const modId of item.allowed_modifiers) {
                const globalModOptions = aiGlobalModifiers[modId];
                if (globalModOptions && globalModOptions.length > 0) {
                  try {
                    // Crea un ModifierGroup por cada ID permitido para este platillo
                    const { data: group } = await api.post(`/api/menu/items/${createdItem.id}/modifier-groups`, {
                      name: modId.replace(/_/g, " ").toUpperCase(), 
                      required: false, multiSelect: true, minSelection: 0, maxSelection: 0, freeModifiersLimit: 0
                    });
                    
                    for (const opt of globalModOptions) {
                      await api.post(`/api/menu/modifier-groups/${group.id}/modifiers`, {
                        name: opt.name, priceAdd: opt.price_extra || 0, isDefault: false
                      });
                    }
                  } catch(e) { console.error("Error creando modifier group IA", e); }
                }
              }
            }
          } catch (err) { console.error("Error creando item IA", err); }
        }
      }

      fetchData();
      setScanState({ active: false, currentFile: '', current: 0, total: 0, error: null });
    } catch (error: any) {
      clearInterval(cycleInterval);
      const errMsg = error.response?.data?.error;
      const errText = typeof errMsg === 'string' ? errMsg : (errMsg?.message || error.message || "Error al procesar con IA");
      setScanState(p => ({ ...p, error: errText }));
    } finally {
      e.target.value = "";
    }
  }

  function openForm(item?: any) {
    if (item) {
      setEditItem(item);
      setForm({ name:item.name, description:item.description||"", price:String(item.price), categoryId:item.categoryId, isPopular:item.isPopular, imageUrl:item.imageUrl||"", imageFit:item.imageFit||"cover", isPromo:item.isPromo||false, activeDays:item.activeDays||[], variantTemplateIds:[], variantMultiSelect:!!item.variantMultiSelect, variantMinSelection:item.variantMinSelection??0, variantMaxSelection:item.variantMaxSelection??0 });
      setImagePreview(item.imageUrl||"");
      api.get(`/api/menu/items/${item.id}`).then(r => {
        setComplements(r.data.complements || []);
        setVariants(r.data.variants || []);
        const tplIds = (r.data.variantTemplates || r.data.appliedTemplates || []).map((t: any) => t.id ?? t.variantTemplateId).filter(Boolean);
        setForm(p => ({ ...p, variantTemplateIds: tplIds }));
      }).catch(() => { setComplements([]); setVariants([]); });
    } else {
      setEditItem(null);
      setForm({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, activeDays:[], variantTemplateIds:[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0 });
      setImagePreview("");
      setComplements([]);
      setVariants([]);
    }
    setNewComp({ name: '', price: '' });
    setNewVariant({ name: '', price: '' });
    setEditingComp(null);
    setEditingVariant(null);
    setActiveTab('variants');
    setImageFile(null);
    setShowNewCat(false);
    setNewCatName("");
    setShowForm(true);
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setForm(p => ({...p, imageUrl:""}));
  }

  async function uploadImageToCloud(): Promise<string> {
    if (!imageFile) return form.imageUrl;
    setUploading(true);
    try {
      // Sube a Supabase Storage (bucket "menu-images") con fallback al backend.
      return await uploadMenuImage(imageFile);
    } finally { setUploading(false); }
  }

  async function createCategoryInline() {
    const name = newCatName.trim();
    if (!name || creatingCat) return;
    setCreatingCat(true);
    try {
      const { data } = await api.post("/api/menu/categories", { name });
      setCats(prev => [...prev, data]);
      setForm(p => ({ ...p, categoryId: data.id }));
      setNewCatName("");
      setShowNewCat(false);
    } catch (e: any) {
      alert(e?.response?.data?.error || "No se pudo crear la categoría");
    } finally {
      setCreatingCat(false);
    }
  }

  // ── Variantes ──────────────────────────────────────────────────
  async function addVariant() {
    if (!editItem || !newVariant.name) return;
    setSavingVariant(true);
    try {
      const { data } = await api.post(`/api/menu/${editItem.id}/variants`, {
        name: newVariant.name, price: parseFloat(newVariant.price) || 0,
      });
      setVariants(p => [...p, data]);
      setNewVariant({ name: '', price: '' });
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al agregar variante');
    } finally { setSavingVariant(false); }
  }

  function startEditVariant(v: any) {
    setEditingVariant(v.id);
    setEditVariantForm({ name: v.name, price: String(v.price) });
  }

  async function saveEditVariant(id: string) {
    try {
      await api.put(`/api/menu/variants/${id}`, {
        name: editVariantForm.name, price: parseFloat(editVariantForm.price) || 0,
      });
      setVariants(p => p.map(v => v.id === id ? { ...v, name: editVariantForm.name, price: parseFloat(editVariantForm.price) || 0 } : v));
      setEditingVariant(null);
    } catch { alert('Error al guardar variante'); }
  }

  async function deleteVariant(id: string) {
    if (!confirm('¿Eliminar esta variante?')) return;
    try {
      await api.delete(`/api/menu/variants/${id}`);
      setVariants(p => p.filter(v => v.id !== id));
    } catch { alert('Error al eliminar'); }
  }

  // ── Complementos ───────────────────────────────────────────────
  async function addComplement() {
    if (!editItem || !newComp.name) return;
    setSavingComp(true);
    try {
      const { data } = await api.post(`/api/menu/items/${editItem.id}/complements`, {
        name: newComp.name, price: parseFloat(newComp.price) || 0,
      });
      setComplements(p => [...p, data]);
      setNewComp({ name: '', price: '' });
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al agregar');
    } finally { setSavingComp(false); }
  }

  function startEditComp(mod: any) {
    setEditingComp(mod.id);
    setEditCompForm({ name: mod.name, price: String(mod.price) });
  }

  async function saveEditComp(id: string) {
    try {
      await api.put(`/api/menu/items/complements/${id}`, {
        name: editCompForm.name, price: parseFloat(editCompForm.price) || 0,
      });
      setComplements(p => p.map(m => m.id === id ? { ...m, name: editCompForm.name, price: parseFloat(editCompForm.price) || 0 } : m));
      setEditingComp(null);
    } catch { alert('Error al guardar'); }
  }

  async function deleteComplement(id: string) {
    if (!confirm('¿Eliminar este complemento?')) return;
    try {
      await api.delete(`/api/menu/items/complements/${id}`);
      setComplements(p => p.filter(m => m.id !== id));
    } catch { alert('Error al eliminar'); }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const imageUrl = await uploadImageToCloud();
      const payload = { ...form, price: parseFloat(form.price), imageUrl };
      if (editItem) await api.put(`/api/menu/items/${editItem.id}`, payload);
      else await api.post("/api/menu/items", payload);
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      alert(extractErrorMessage(err, "Error al guardar"));
    } finally { setSaving(false); }
  }

  async function deleteItem(item: any) {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    try {
      await api.delete(`/api/menu/items/${item.id}`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar');
    }
  }

  async function toggleAvailable(item: any) {
    await api.put(`/api/menu/items/${item.id}`, { isAvailable: !item.isAvailable });
    fetchData();
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length && filtered.length > 0 ? new Set() : new Set(filtered.map(i => i.id)));
  }
  async function bulkToggleAvailable(available: boolean) {
    await Promise.all([...selectedIds].map(id => api.put(`/api/menu/items/${id}`, { isAvailable: available }).catch(() => {})));
    setSelectedIds(new Set()); fetchData();
  }
  async function bulkDelete() {
    if (!confirm(`¿Eliminar ${selectedIds.size} platillo(s)? Esta acción no se puede deshacer.`)) return;
    const results = await Promise.allSettled(
      [...selectedIds].map(id => api.delete(`/api/menu/items/${id}`))
    );
    const failed = results.filter(r => r.status === 'rejected');
    setSelectedIds(new Set());
    fetchData();
    if (failed.length > 0) {
      const firstErr: any = (failed[0] as PromiseRejectedResult).reason;
      const msg = firstErr?.response?.data?.error || firstErr?.message || 'Error desconocido';
      alert(`No se pudieron eliminar ${failed.length} de ${results.length} platillo(s).\n\nMotivo: ${msg}`);
    }
  }

  async function wipeAllMenu() {
    if (wipeConfirm !== "BORRAR") return;
    setWiping(true);
    try {
      const { data } = await api.post('/api/menu/wipe-all', { confirm: 'BORRAR' });
      const d = data?.deleted || {};
      alert(`Menú borrado: ${d.menuItems || 0} platillos, ${d.categories || 0} categorías, ${d.variantTemplates || 0} grupos de variantes, ${d.orderItems || 0} líneas de orden afectadas.`);
      setShowWipe(false);
      setWipeConfirm("");
      setSelectedIds(new Set());
      setDrillCategoryId(null);
      setView("categories");
      fetchData();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Error al borrar el menú');
    } finally {
      setWiping(false);
    }
  }
  async function bulkChangeCategory(categoryId: string) {
    if (!categoryId) return;
    await Promise.all([...selectedIds].map(id => api.put(`/api/menu/items/${id}`, { categoryId }).catch(() => {})));
    setSelectedIds(new Set()); fetchData();
  }

  function EditableList({ items, editingId, editForm, onStartEdit, onSaveEdit, onCancelEdit, onDelete, onChangeForm, addSection }: any) {
    return (
      <div>
        {items.length > 0 && (
          <div className="flex flex-col gap-1 mb-3">
            <div className="grid grid-cols-12 gap-2 px-3 pb-1 text-xs font-black uppercase tracking-wider" style={{color:"var(--muted)"}}>
              <span className="col-span-6">Nombre</span>
              <span className="col-span-3 text-right">Precio</span>
              <span className="col-span-3"></span>
            </div>
            {items.map((item: any) => (
              <div key={item.id}>
                {editingId === item.id ? (
                  <div className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl"
                    style={{background:"var(--surf2)",border:"1.5px solid var(--gold)"}}>
                    <input value={editForm.name}
                      onChange={e => onChangeForm((p: any) => ({...p, name: e.target.value}))}
                      className="col-span-6 px-2 py-1.5 rounded-lg text-sm outline-none"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-xs" style={{color:"var(--muted)"}}>$</span>
                      <input value={editForm.price} type="number"
                        onChange={e => onChangeForm((p: any) => ({...p, price: e.target.value}))}
                        className="w-full px-2 py-1.5 rounded-lg text-sm outline-none text-right"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                    <div className="col-span-3 flex gap-1 justify-end">
                      <button type="button" onClick={() => onSaveEdit(item.id)}
                        className="px-2 py-1.5 rounded-lg text-xs font-black"
                        style={{background:"var(--gold)",color:"#000"}}>✓</button>
                      <button type="button" onClick={onCancelEdit}
                        className="px-2 py-1.5 rounded-lg text-xs"
                        style={{background:"var(--surf)",color:"var(--muted)",border:"1px solid var(--border)"}}>✕</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-12 gap-2 items-center px-3 py-2 rounded-xl group transition-all"
                    style={{background:"var(--surf2)"}}>
                    <span className="col-span-6 text-sm font-medium">{item.name}</span>
                    <span className="col-span-3 text-sm font-bold text-right" style={{color:"var(--gold)"}}>
                      ${item.price > 0 ? item.price : '0.00'}
                    </span>
                    <div className="col-span-3 flex gap-1 justify-end">
                      <button type="button" onClick={() => onStartEdit(item)}
                        className="px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{background:"rgba(245,166,35,0.15)",color:"var(--gold)"}}>✏️</button>
                      <button type="button" onClick={() => onDelete(item.id)}
                        className="px-2 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                        style={{background:"rgba(239,68,68,0.1)",color:"#ef4444"}}>🗑️</button>
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

  // Reglas de filtrado:
  // - Si hay search activa → busca en TODO el catálogo (ignora drill).
  // - Si hay drillCategoryId → solo items de esa categoría.
  // - Si no hay nada → todos (sólo aplica cuando view='products' sin drill).
  const filtered = items.filter((i) => {
    if (search.trim()) {
      return (i.name || "").toLowerCase().includes(search.toLowerCase());
    }
    if (drillCategoryId) return i.categoryId === drillCategoryId;
    if (filterCat !== "all") return i.categoryId === filterCat;
    return true;
  });

  // Conteo de items por categoría para los tiles de la vista 'categories'.
  const itemCountByCat = items.reduce<Record<string, number>>((acc, it) => {
    const cid = it.categoryId || "_uncat";
    acc[cid] = (acc[cid] || 0) + 1;
    return acc;
  }, {});

  // Categorías filtradas por search (para que el grid también responda).
  const filteredCats = search.trim()
    ? cats.filter((c) => (c.name || "").toLowerCase().includes(search.toLowerCase()))
    : cats;

  const activeDrillCat = cats.find((c) => c.id === drillCategoryId) || null;
  const showCategoriesGrid = view === "categories" && !search.trim();
  const showItemsList = !showCategoriesGrid;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-syne text-2xl sm:text-3xl font-black">Menú</h1>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Gestión de artículos y categorías</p>
        </div>
        <div className="flex gap-2 sm:gap-3 flex-wrap">
          {/* BOTÓN IA ESCANEO */}
          <label className={`flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${scanState.active ? 'bg-orange-200 text-black cursor-not-allowed' : 'bg-orange-500 text-white shadow-orange-500/20 cursor-pointer'}`}>
            🤖 <span className="whitespace-nowrap">Escaneo IA</span>
            {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
          </label>

          <button onClick={() => openForm()}
            className="flex-1 sm:flex-initial px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-syne font-black bg-white text-black hover:bg-gray-200 transition-all whitespace-nowrap"
          >
            + Nuevo platillo
          </button>
        </div>
      </div>

      {/* Barra de búsqueda + breadcrumb */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input value={search} onChange={e => { setSearch(e.target.value); if (e.target.value.trim()) setView("products"); }}
          placeholder="Buscar platillos o categorías..."
          className="px-4 py-2 rounded-xl text-sm outline-none flex-1 min-w-48"
          style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
        {search.trim() && (
          <button type="button" onClick={() => { setSearch(""); setView("categories"); setDrillCategoryId(null); }}
            className="px-3 py-2 rounded-xl text-xs font-bold"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--muted)"}}>
            ✕ Limpiar
          </button>
        )}
        {!search.trim() && view === "products" && (
          <button type="button" onClick={() => { setView("categories"); setDrillCategoryId(null); setFilterCat("all"); }}
            className="px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
            style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--muted)"}}>
            ← Categorías
          </button>
        )}
        <span className="text-xs font-bold" style={{color:"var(--muted)"}}>
          {showCategoriesGrid
            ? `${filteredCats.length} categorías`
            : `${filtered.length} artículos${activeDrillCat ? ` en ${activeDrillCat.name}` : ""}`}
        </span>
      </div>

      {/* Grid de categorías (drill-down landing) */}
      {!loading && showCategoriesGrid && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredCats.length === 0 ? (
            <div className="col-span-full text-center py-20" style={{color:"var(--muted)"}}>
              <p className="text-sm font-bold uppercase tracking-wider">Sin categorías</p>
            </div>
          ) : (
            filteredCats.map((c) => {
              const count = itemCountByCat[c.id] || 0;
              return (
                <button key={c.id} type="button"
                  onClick={() => { setDrillCategoryId(c.id); setView("products"); setFilterCat("all"); }}
                  className="flex flex-col items-start gap-2 p-5 rounded-2xl border text-left transition-all active:scale-[0.98] hover:border-[var(--gold)]"
                  style={{background:"var(--surf)",borderColor:"var(--border)"}}>
                  <div className="flex items-center justify-between w-full">
                    <span className="text-2xl">📂</span>
                    <span className="text-xs font-black px-2 py-1 rounded-full" style={{background:"var(--surf2)",color:"var(--muted)"}}>{count}</span>
                  </div>
                  <h3 className="font-syne font-black text-base leading-tight">{c.name}</h3>
                  <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:"var(--muted)"}}>
                    {count === 1 ? "1 producto" : `${count} productos`}
                  </span>
                </button>
              );
            })
          )}
          {/* Tile especial: ver todo */}
          {!search.trim() && (
            <button type="button"
              onClick={() => { setDrillCategoryId(null); setView("products"); setFilterCat("all"); }}
              className="flex flex-col items-start gap-2 p-5 rounded-2xl border border-dashed text-left transition-all active:scale-[0.98] hover:border-[var(--gold)]"
              style={{borderColor:"var(--border)"}}>
              <div className="flex items-center justify-between w-full">
                <span className="text-2xl">🍽️</span>
                <span className="text-xs font-black px-2 py-1 rounded-full" style={{background:"var(--surf2)",color:"var(--muted)"}}>{items.length}</span>
              </div>
              <h3 className="font-syne font-black text-base leading-tight">Ver todos los productos</h3>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{color:"var(--muted)"}}>
                Lista completa
              </span>
            </button>
          )}
        </div>
      )}

      {/* Lista compacta */}
      {loading ? <div className="text-center py-20">Cargando...</div> : showItemsList && (
        <>
          {/* Tabla (desktop ≥ md) */}
          <div className="hidden md:block rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
            <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-black uppercase tracking-wider border-b"
              style={{background:"var(--surf2)",borderColor:"var(--border)",color:"var(--muted)"}}>
              <div className="col-span-1 flex items-center gap-2">
                <input type="checkbox" className="rounded cursor-pointer accent-[var(--gold)]"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll} />
              </div>
              <span className="col-span-3">Nombre del artículo</span>
              <span className="col-span-2">Categoría</span>
              <span className="col-span-1 text-right">Precio</span>
              <span className="col-span-2 text-center">Estado</span>
              <span className="col-span-3 text-right">Acciones</span>
            </div>

            {filtered.map((item, idx) => {
              const sel = selectedIds.has(item.id);
              return (
                <div key={item.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b transition-all"
                  style={{borderColor:"var(--border)", background: sel ? "rgba(245,166,35,0.05)" : idx % 2 === 0 ? "var(--surf)" : "transparent", opacity: item.isAvailable ? 1 : 0.5}}>
                  <div className="col-span-1 flex items-center gap-2">
                    <input type="checkbox" className="rounded cursor-pointer accent-[var(--gold)]"
                      checked={sel} onChange={() => toggleSelect(item.id)} />
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:"var(--surf2)"}}>
                      {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={32} height={32} className={`w-full h-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <span className="text-sm">🍔</span>}
                    </div>
                  </div>
                  <div className="col-span-3 font-syne font-bold text-sm truncate">{item.name}</div>
                  <div className="col-span-2 text-xs font-medium text-[var(--muted)]">{item.category?.name || "—"}</div>
                  <div className="col-span-1 text-right font-syne font-black text-sm text-[var(--gold)]">${item.price}</div>
                  <div className="col-span-2 flex justify-center">
                    <button onClick={() => toggleAvailable(item)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${item.isAvailable ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                      {item.isAvailable ? "● Activo" : "● Inactivo"}
                    </button>
                  </div>
                  <div className="col-span-3 flex gap-2 justify-end">
                    <button onClick={() => openForm(item)} className="px-3 py-1.5 rounded-lg text-xs font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>✏️ Editar</button>
                    <button onClick={() => deleteItem(item)} className="px-2 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/20">🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Tarjetas (mobile < md) */}
          <div className="md:hidden flex flex-col gap-2 pb-24">
            {filtered.length > 0 && (
              <div className="flex items-center gap-2 px-2 py-2">
                <input type="checkbox" className="rounded cursor-pointer accent-[var(--gold)] w-4 h-4"
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onChange={toggleSelectAll} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--muted)"}}>
                  Seleccionar todos
                </span>
              </div>
            )}
            {filtered.map((item) => {
              const sel = selectedIds.has(item.id);
              return (
                <div key={item.id} className="rounded-2xl border p-3 transition-all"
                  style={{borderColor: sel ? "var(--gold)" : "var(--border)", background: sel ? "rgba(245,166,35,0.05)" : "var(--surf)", opacity: item.isAvailable ? 1 : 0.55}}>
                  <div className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 rounded cursor-pointer accent-[var(--gold)] w-4 h-4 flex-shrink-0"
                      checked={sel} onChange={() => toggleSelect(item.id)} />
                    <div className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0" style={{background:"var(--surf2)"}}>
                      {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={48} height={48} className={`w-full h-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <span className="text-xl">🍔</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-syne font-black text-sm leading-tight truncate">{item.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-xs font-medium" style={{color:"var(--muted)"}}>{item.category?.name || "—"}</span>
                        <span className="font-syne font-black text-sm text-[var(--gold)]">${item.price}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button onClick={() => toggleAvailable(item)} className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${item.isAvailable ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                      {item.isAvailable ? "● Activo" : "● Inactivo"}
                    </button>
                    <button onClick={() => openForm(item)} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>✏️ Editar</button>
                    <button onClick={() => deleteItem(item)} className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/20">🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Overlay IA Escaneo */}
      {scanState.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.75)' }}>
          <style>{`
            @keyframes ai-scan-bar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(500%); }
            }
          `}</style>
          <div className="rounded-2xl p-8 w-full max-w-sm mx-4 text-center flex flex-col items-center gap-5"
            style={{ background: 'var(--surf)', border: '1px solid var(--border)' }}>
            {scanState.error ? (
              <>
                <div className="text-4xl">❌</div>
                <h2 className="font-syne font-black text-xl">Error al escanear</h2>
                <p className="text-sm px-2" style={{ color: 'var(--muted)' }}>{scanState.error}</p>
                <button
                  onClick={() => setScanState({ active: false, currentFile: '', current: 0, total: 0, error: null })}
                  className="px-6 py-2.5 rounded-xl font-bold text-sm"
                  style={{ background: 'var(--gold)', color: '#000' }}>
                  Cerrar
                </button>
              </>
            ) : (
              <>
                <div className="text-5xl animate-bounce">🤖</div>
                <div>
                  <h2 className="font-syne font-black text-xl">Analizando con IA...</h2>
                  <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>No cierres esta ventana</p>
                </div>
                <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--surf2)' }}>
                  <div className="h-full w-1/3 rounded-full"
                    style={{ background: 'var(--gold)', animation: 'ai-scan-bar 1.5s infinite ease-in-out' }} />
                </div>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Procesando:{' '}
                  <span className="font-bold" style={{ color: 'var(--text)' }}>{scanState.currentFile}</span>
                  {scanState.total > 0 && ` (${scanState.current} de ${scanState.total})`}
                </p>
                <div className="flex gap-2">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2.5 h-2.5 rounded-full animate-bounce"
                      style={{ background: 'var(--gold)', animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-3 sm:bottom-6 left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 rounded-2xl shadow-2xl border overflow-x-auto"
          style={{background:"var(--surf)",borderColor:"var(--gold)",boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
          <span className="text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg flex-shrink-0" style={{background:"rgba(245,166,35,0.15)",color:"var(--gold)"}}>
            {selectedIds.size} <span className="hidden sm:inline">seleccionado{selectedIds.size !== 1 ? "s" : ""}</span>
          </span>
          <button onClick={() => bulkToggleAvailable(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-green-400 border border-green-500/30 bg-green-500/10 hover:bg-green-500/20 transition-all flex-shrink-0">
            ● Activar
          </button>
          <button onClick={() => bulkToggleAvailable(false)}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all flex-shrink-0">
            ● Desactivar
          </button>
          <select onChange={e => { bulkChangeCategory(e.target.value); e.target.value = ""; }}
            defaultValue=""
            className="px-3 py-1.5 rounded-xl text-xs font-black outline-none flex-shrink-0 max-w-[140px] sm:max-w-none"
            style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}>
            <option value="" disabled>Mover a categoría…</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={bulkDelete}
            className="px-3 py-1.5 rounded-xl text-xs font-black text-red-400 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 transition-all flex-shrink-0">
            🗑️ <span className="hidden sm:inline">Eliminar</span>
          </button>
          <button onClick={() => setSelectedIds(new Set())}
            className="w-7 h-7 rounded-xl flex items-center justify-center text-sm transition-all flex-shrink-0"
            style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
        </div>
      )}

      {/* Modal Formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{background:"rgba(0,0,0,0.8)"}}>
          <div className="w-full max-w-lg rounded-2xl border my-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
              <h2 className="font-syne font-black text-xl">{editItem ? "Editar platillo" : "Nuevo platillo"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>
            <form onSubmit={saveItem} className="p-6 flex flex-col gap-4">
              {/* Contenido del formulario */}
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Imagen</label>
                {imagePreview && (
                  <>
                    <div className="relative w-full h-40 rounded-xl overflow-hidden mb-2" style={{background:"var(--surf2)"}}>
                      <Image src={imagePreview} alt="preview" fill className={form.imageFit === "contain" ? "object-contain" : "object-cover"} />
                    </div>
                    <div className="flex gap-2 mb-2">
                      {([["cover","Rellenar","Recorta para llenar la tarjeta"],["contain","Ajustar","Muestra la foto completa"]] as const).map(([val,label,hint]) => {
                        const active = form.imageFit === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setForm(p => ({...p, imageFit: val}))}
                            title={hint}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-black border transition-all"
                            style={{
                              background: active ? "var(--gold)" : "transparent",
                              color: active ? "#000" : "var(--muted)",
                              borderColor: active ? "var(--gold)" : "var(--border)",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer border w-full"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  📷 Subir foto
                  <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                </label>
                <input value={form.imageUrl} onChange={e => { setForm(p=>({...p,imageUrl:e.target.value})); setImagePreview(e.target.value); setImageFile(null); }}
                  placeholder="o pega URL"
                  className="w-full px-3 py-2.5 rounded-xl text-sm outline-none mt-2"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Nombre</label>
                  <input placeholder="Hamburguesa" value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} required className="w-full px-4 py-2.5 rounded-xl text-sm" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Precio Base</label>
                  <input placeholder="89.00" value={form.price} onChange={e => setForm(p => ({...p,price:e.target.value}))} required type="number" className="w-full px-4 py-2.5 rounded-xl text-sm" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Categoría</label>
                  <div className="flex gap-2">
                    <select
                      value={form.categoryId}
                      onChange={e => setForm(p=>({...p,categoryId:e.target.value}))}
                      required={!showNewCat}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm"
                      style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}
                    >
                      <option value="">Seleccionar...</option>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setShowNewCat(s => !s); setNewCatName(""); }}
                      className="px-3 py-2.5 rounded-xl text-xs font-black border whitespace-nowrap transition-all"
                      style={{
                        background: showNewCat ? "var(--gold)" : "transparent",
                        color: showNewCat ? "#000" : "var(--gold)",
                        borderColor: "var(--gold)",
                      }}
                      aria-label="Crear nueva categoría"
                    >
                      {showNewCat ? "✕ Cerrar" : "+ Nueva"}
                    </button>
                  </div>

                  {showNewCat && (
                    <div className="mt-2 flex gap-2 p-2 rounded-xl" style={{background:"var(--surf2)",border:"1px dashed var(--gold)"}}>
                      <input
                        autoFocus
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); createCategoryInline(); }
                          if (e.key === "Escape") { setShowNewCat(false); setNewCatName(""); }
                        }}
                        placeholder="Nombre de la nueva categoría"
                        className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}}
                      />
                      <button
                        type="button"
                        onClick={createCategoryInline}
                        disabled={creatingCat || !newCatName.trim()}
                        className="px-4 py-2 rounded-lg text-xs font-black transition-all disabled:opacity-50"
                        style={{background:"var(--gold)",color:"#000"}}
                      >
                        {creatingCat ? "..." : "Crear"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Seleccion multiple de variantes */}
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>
                    Seleccion de Variantes
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, variantMultiSelect: !p.variantMultiSelect }))}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                    style={{
                      background: form.variantMultiSelect ? "rgba(245,166,35,0.12)" : "var(--surf2)",
                      border: `1.5px solid ${form.variantMultiSelect ? "var(--gold)" : "var(--border)"}`,
                    }}
                  >
                    <div>
                      <span className="font-bold">Permitir elegir varias</span>
                      <p className="text-xs mt-0.5" style={{color:"var(--muted)"}}>Para sabores que se combinan (ej. 1kg de boneless con 3 sabores).</p>
                    </div>
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{background: form.variantMultiSelect ? "var(--gold)" : "var(--surf)", border:`1px solid ${form.variantMultiSelect ? "var(--gold)" : "var(--border)"}`}}>
                      {form.variantMultiSelect && <span className="text-black text-[10px] font-black leading-none">✓</span>}
                    </div>
                  </button>
                  {form.variantMultiSelect && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Minimo (0 = opcional)</label>
                        <input type="number" min={0} value={form.variantMinSelection} onChange={e => setForm(p => ({ ...p, variantMinSelection: Math.max(0, parseInt(e.target.value,10) || 0) }))} className="w-full px-4 py-2.5 rounded-xl text-sm" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>Maximo (0 = sin tope)</label>
                        <input type="number" min={0} value={form.variantMaxSelection} onChange={e => setForm(p => ({ ...p, variantMaxSelection: Math.max(0, parseInt(e.target.value,10) || 0) }))} className="w-full px-4 py-2.5 rounded-xl text-sm" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Grupos de Variantes */}
                <div className="col-span-2">
                  <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>
                    Grupos de Variantes <span style={{color:"var(--muted)",fontWeight:400,textTransform:"none",letterSpacing:0}}>(Opcional)</span>
                  </label>
                  {variantTemplates.length === 0 ? (
                    <p className="text-xs px-1" style={{color:"var(--muted)"}}>
                      Sin grupos creados.{" "}
                      <a href="/admin/menu/variantes" target="_blank" style={{color:"var(--gold)"}}>Crear grupos →</a>
                    </p>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {variantTemplates.map((tpl: any) => {
                        const selected = form.variantTemplateIds.includes(tpl.id);
                        return (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => setForm(p => ({
                              ...p,
                              variantTemplateIds: selected
                                ? p.variantTemplateIds.filter(id => id !== tpl.id)
                                : [...p.variantTemplateIds, tpl.id],
                            }))}
                            className="flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all"
                            style={{
                              background: selected ? "rgba(245,166,35,0.12)" : "var(--surf2)",
                              border: `1.5px solid ${selected ? "var(--gold)" : "var(--border)"}`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                                style={{background: selected ? "var(--gold)" : "var(--surf)", border:`1px solid ${selected ? "var(--gold)" : "var(--border)"}`}}>
                                {selected && <span className="text-black text-[10px] font-black leading-none">✓</span>}
                              </div>
                              <span className="font-bold">{tpl.name}</span>
                            </div>
                            <span className="text-xs" style={{color:"var(--muted)"}}>
                              {tpl.options?.length ?? 0} opciones
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Modificadores (solo al editar item ya creado) */}
                {editItem && (
                  <div className="col-span-2">
                    <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>
                      Modificadores <span style={{color:"var(--muted)",fontWeight:400,textTransform:"none",letterSpacing:0}}>(Sin costo o con extra)</span>
                    </label>
                    <ModifierGroupsEditor itemId={editItem.id} />
                  </div>
                )}

                {/* Promoción por día */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-xs font-bold uppercase tracking-wider" style={{color:"var(--muted)"}}>Promoción por día</span>
                    <button
                      type="button"
                      onClick={() => setForm(p => ({ ...p, isPromo: !p.isPromo }))}
                      className="relative w-11 h-6 rounded-full transition-all"
                      style={{ background: form.isPromo ? '#ff5c35' : 'var(--surf2)', border: '1px solid var(--border)' }}>
                      <span className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform"
                        style={{ transform: form.isPromo ? 'translateX(20px)' : 'translateX(0)' }} />
                    </button>
                  </div>
                  {form.isPromo && (
                    <div className="mt-2 flex gap-1.5 flex-wrap">
                      {[
                        { key: 'MONDAY',    label: 'Lun' },
                        { key: 'TUESDAY',   label: 'Mar' },
                        { key: 'WEDNESDAY', label: 'Mié' },
                        { key: 'THURSDAY',  label: 'Jue' },
                        { key: 'FRIDAY',    label: 'Vie' },
                        { key: 'SATURDAY',  label: 'Sáb' },
                        { key: 'SUNDAY',    label: 'Dom' },
                      ].map(({ key, label }) => {
                        const active = form.activeDays.includes(key)
                        return (
                          <button key={key} type="button"
                            onClick={() => setForm(p => ({
                              ...p,
                              activeDays: active
                                ? p.activeDays.filter(d => d !== key)
                                : [...p.activeDays, key]
                            }))}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={{
                              background: active ? '#ff5c35' : 'var(--surf2)',
                              color: active ? '#fff' : 'var(--muted)',
                              border: `1px solid ${active ? '#ff5c35' : 'var(--border)'}`
                            }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-xl font-bold text-sm border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl font-syne font-black text-sm" style={{background:"var(--gold)",color:"#000"}}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zona de peligro — Wipe del menú */}
      {!loading && (
        <div className="mt-10 mb-6 rounded-2xl border p-4 sm:p-5" style={{borderColor:"rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.04)"}}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="font-syne font-black text-sm uppercase tracking-wider" style={{color:"#ef4444"}}>Zona de peligro</h3>
              <p className="text-xs mt-1" style={{color:"var(--muted)"}}>
                Borra todo el menú del restaurante (platillos, categorías y grupos de variantes). Útil para volver a generarlo con IA desde cero.
              </p>
            </div>
            <button type="button" onClick={() => { setShowWipe(true); setWipeConfirm(""); }}
              className="px-4 py-2 rounded-xl text-xs font-black border whitespace-nowrap transition-all"
              style={{borderColor:"#ef4444",color:"#ef4444",background:"rgba(239,68,68,0.08)"}}>
              🗑️ Borrar todo el menú
            </button>
          </div>
        </div>
      )}

      {/* Modal confirmación wipe */}
      {showWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.8)"}}>
          <div className="w-full max-w-md rounded-2xl border" style={{background:"var(--surf)",borderColor:"#ef4444"}}>
            <div className="p-5 sm:p-6 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span className="text-3xl">⚠️</span>
                <h2 className="font-syne font-black text-lg sm:text-xl" style={{color:"#ef4444"}}>Borrar todo el menú</h2>
              </div>
              <p className="text-sm" style={{color:"var(--muted)"}}>
                Esta acción <strong style={{color:"var(--text)"}}>no se puede deshacer</strong>. Se eliminarán todos los platillos, categorías y grupos de variantes de este restaurante, junto con sus referencias en órdenes pasadas.
              </p>
              <p className="text-xs" style={{color:"var(--muted)"}}>Escribe <strong style={{color:"#ef4444"}}>BORRAR</strong> para confirmar:</p>
              <input
                autoFocus
                value={wipeConfirm}
                onChange={e => setWipeConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && wipeConfirm === 'BORRAR') wipeAllMenu(); if (e.key === 'Escape') setShowWipe(false); }}
                placeholder="BORRAR"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}
              />
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => { setShowWipe(false); setWipeConfirm(""); }}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  Cancelar
                </button>
                <button type="button" onClick={wipeAllMenu} disabled={wipeConfirm !== "BORRAR" || wiping}
                  className="flex-1 py-2.5 rounded-xl font-syne font-black text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{background:"#ef4444",color:"#fff"}}>
                  {wiping ? "Borrando..." : "Borrar todo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
