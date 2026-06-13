"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Bot, Plus, Search, X, FolderOpen, UtensilsCrossed, Pencil, Trash2,
  Check, Power, ImagePlus, ChevronLeft, AlertTriangle, Shuffle,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import ModifierGroupsEditor from "@/components/admin/ModifierGroupsEditor";
import { uploadMenuImage } from "@/lib/supabaseUpload";
import { extractErrorMessage } from "@/lib/errors";
import {
  WtScreen, PageHeader, WtCard, SectionLabel, Pill, IconBadge, Toggle,
  PrimaryBtn, EmptyState, money,
} from "@/components/warmtech";

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
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed text-xs font-bold text-primary transition-all"
          style={{ borderColor: "var(--brand-primary)" }}>
          <Shuffle size={15} strokeWidth={2} /> Aplicar grupo de variantes
        </button>
      ) : (
        <WtCard className="p-3">
          <p className="mb-2 text-xs font-bold text-tx-mut">Selecciona un grupo:</p>
          {templates.length === 0 ? (
            <p className="text-xs text-tx-mut">Sin grupos creados. Ve a Menú → Variantes</p>
          ) : (
            <div className="flex flex-col gap-1">
              {templates.map((t: any) => (
                <button key={t.id} type="button" onClick={() => apply(t.id)} disabled={applying}
                  className="flex min-h-11 items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-all"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}>
                  <span className="font-bold text-tx">{t.name}</span>
                  <span className="text-xs text-tx-mut">{t.options?.length || 0} opciones</span>
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={() => setOpen(false)}
            className="mt-2 text-xs text-tx-mut">Cancelar</button>
        </WtCard>
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
  const [form, setForm] = useState({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, promoPrice:"", activeDays:[] as string[], variantTemplateIds:[] as string[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0 });
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
      setForm({ name:item.name, description:item.description||"", price:String(item.price), categoryId:item.categoryId, isPopular:item.isPopular, imageUrl:item.imageUrl||"", imageFit:item.imageFit||"cover", isPromo:item.isPromo||false, promoPrice:item.promoPrice == null ? "" : String(item.promoPrice), activeDays:item.activeDays||[], variantTemplateIds:[], variantMultiSelect:!!item.variantMultiSelect, variantMinSelection:item.variantMinSelection??0, variantMaxSelection:item.variantMaxSelection??0 });
      setImagePreview(item.imageUrl||"");
      api.get(`/api/menu/items/${item.id}`).then(r => {
        setComplements(r.data.complements || []);
        setVariants(r.data.variants || []);
        const tplIds = (r.data.variantTemplates || r.data.appliedTemplates || []).map((t: any) => t.id ?? t.variantTemplateId).filter(Boolean);
        setForm(p => ({ ...p, variantTemplateIds: tplIds }));
      }).catch(() => { setComplements([]); setVariants([]); });
    } else {
      setEditItem(null);
      setForm({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, promoPrice:"", activeDays:[], variantTemplateIds:[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0 });
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
    const regularPrice = Number(form.price);
    const promoPrice = Number(form.promoPrice);
    if (form.isPromo && (!form.promoPrice || !Number.isFinite(promoPrice) || promoPrice <= 0 || promoPrice >= regularPrice)) {
      alert("El precio promocional debe ser mayor a 0 y menor al precio regular.");
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadImageToCloud();
      const payload = {
        ...form,
        price: regularPrice,
        promoPrice: form.isPromo ? promoPrice : null,
        imageUrl,
      };
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
          <div className="mb-3 flex flex-col gap-1">
            <div className="grid grid-cols-12 gap-2 px-3 pb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim">
              <span className="col-span-6">Nombre</span>
              <span className="col-span-3 text-right">Precio</span>
              <span className="col-span-3"></span>
            </div>
            {items.map((item: any) => (
              <div key={item.id}>
                {editingId === item.id ? (
                  <div className="grid grid-cols-12 items-center gap-2 rounded-xl p-2"
                    style={{ background: "var(--surf-2)", border: "1.5px solid var(--brand-primary)" }}>
                    <input value={editForm.name}
                      onChange={e => onChangeForm((p: any) => ({...p, name: e.target.value}))}
                      className="col-span-6 rounded-lg px-2 py-1.5 text-sm text-tx outline-none"
                      style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }} />
                    <div className="col-span-3 flex items-center gap-1">
                      <span className="text-xs text-tx-mut">$</span>
                      <input value={editForm.price} type="number"
                        onChange={e => onChangeForm((p: any) => ({...p, price: e.target.value}))}
                        className="w-full rounded-lg px-2 py-1.5 text-right text-sm text-tx outline-none"
                        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }} />
                    </div>
                    <div className="col-span-3 flex justify-end gap-1">
                      <button type="button" onClick={() => onSaveEdit(item.id)} aria-label="Guardar"
                        className="grid h-8 w-8 place-items-center rounded-lg text-white"
                        style={{ background: "var(--brand-primary)" }}><Check size={14} strokeWidth={2.6} /></button>
                      <button type="button" onClick={onCancelEdit} aria-label="Cancelar"
                        className="grid h-8 w-8 place-items-center rounded-lg text-tx-mut"
                        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}><X size={14} /></button>
                    </div>
                  </div>
                ) : (
                  <div className="group grid grid-cols-12 items-center gap-2 rounded-xl px-3 py-2 transition-all"
                    style={{ background: "var(--surf-2)" }}>
                    <span className="col-span-6 text-sm font-medium text-tx">{item.name}</span>
                    <span className="col-span-3 text-right font-mono text-sm font-bold text-primary">
                      ${item.price > 0 ? item.price : '0.00'}
                    </span>
                    <div className="col-span-3 flex justify-end gap-1">
                      <button type="button" onClick={() => onStartEdit(item)} aria-label="Editar"
                        className="grid h-8 w-8 place-items-center rounded-lg text-primary opacity-0 transition-opacity group-hover:opacity-100"
                        style={{ background: "var(--iris-soft)" }}><Pencil size={13} /></button>
                      <button type="button" onClick={() => onDelete(item.id)} aria-label="Eliminar"
                        className="grid h-8 w-8 place-items-center rounded-lg opacity-0 transition-opacity group-hover:opacity-100"
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
    <WtScreen>
      <PageHeader
        eyebrow="Catálogo"
        title="Menú"
        subtitle="Gestión de artículos y categorías"
        actions={
          <>
            <label className={`inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold text-white transition-transform active:scale-[.98] ${scanState.active ? "cursor-not-allowed opacity-60" : ""}`}
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}>
              <Bot size={16} strokeWidth={2} /> Escaneo IA
              {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
            </label>
            <PrimaryBtn full={false} ghost icon={Plus} onClick={() => openForm()}>
              Nuevo platillo
            </PrimaryBtn>
          </>
        }
      />

      {/* Acciones (móvil) */}
      <div className="mb-4 flex gap-2 md:hidden">
        <label className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-[13px] px-3 text-xs font-bold text-white transition-transform active:scale-[.98] ${scanState.active ? "cursor-not-allowed opacity-60" : ""}`}
          style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", boxShadow: "0 6px 18px var(--iris-glow)" }}>
          <Bot size={15} strokeWidth={2} /> Escaneo IA
          {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
        </label>
        <button type="button" onClick={() => openForm()}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[13px] px-3 text-xs font-bold text-tx"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}>
          <Plus size={15} strokeWidth={2.2} /> Nuevo platillo
        </button>
      </div>

      {/* Barra de búsqueda + breadcrumb */}
      <WtCard className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[160px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
          <input value={search} onChange={e => { setSearch(e.target.value); if (e.target.value.trim()) setView("products"); }}
            placeholder="Buscar platillos o categorías…"
            className="min-h-11 w-full rounded-xl pl-9 pr-3 text-sm text-tx outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }} />
        </div>
        {search.trim() && (
          <PrimaryBtn full={false} danger icon={X}
            onClick={() => { setSearch(""); setView("categories"); setDrillCategoryId(null); }}>
            Limpiar
          </PrimaryBtn>
        )}
        {!search.trim() && view === "products" && (
          <PrimaryBtn full={false} ghost icon={ChevronLeft}
            onClick={() => { setView("categories"); setDrillCategoryId(null); setFilterCat("all"); }}>
            Categorías
          </PrimaryBtn>
        )}
        <span className="px-1 text-xs font-bold text-tx-mut">
          {showCategoriesGrid
            ? `${filteredCats.length} categorías`
            : `${filtered.length} artículos${activeDrillCat ? ` en ${activeDrillCat.name}` : ""}`}
        </span>
      </WtCard>

      {/* Grid de categorías (drill-down landing) */}
      {!loading && showCategoriesGrid && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredCats.length === 0 ? (
            <div className="col-span-full">
              <EmptyState icon={FolderOpen} title="Sin categorías"
                hint="Crea tu primera categoría al agregar un platillo." />
            </div>
          ) : (
            filteredCats.map((c) => {
              const count = itemCountByCat[c.id] || 0;
              return (
                <WtCard key={c.id}
                  onClick={() => { setDrillCategoryId(c.id); setView("products"); setFilterCat("all"); }}
                  className="flex flex-col items-start gap-2 p-4 md:p-5">
                  <div className="flex w-full items-center justify-between">
                    <IconBadge icon={FolderOpen} tone="ac" size={34} />
                    <span className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-tx-mut"
                      style={{ background: "var(--surf-2)" }}>{count}</span>
                  </div>
                  <h3 className="font-display text-base font-extrabold leading-tight text-tx-hi">{c.name}</h3>
                  <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                    {count === 1 ? "1 producto" : `${count} productos`}
                  </span>
                </WtCard>
              );
            })
          )}
          {/* Tile especial: ver todo */}
          {!search.trim() && (
            <button type="button"
              onClick={() => { setDrillCategoryId(null); setView("products"); setFilterCat("all"); }}
              className="flex flex-col items-start gap-2 rounded-[18px] border border-dashed p-4 text-left transition-all active:scale-[0.98] md:p-5"
              style={{ borderColor: "var(--bd-2)" }}>
              <div className="flex w-full items-center justify-between">
                <IconBadge icon={UtensilsCrossed} tone="neutral" size={34} />
                <span className="rounded-full px-2 py-1 font-mono text-[10px] font-bold text-tx-mut"
                  style={{ background: "var(--surf-2)" }}>{items.length}</span>
              </div>
              <h3 className="font-display text-base font-extrabold leading-tight text-tx-hi">Ver todos los productos</h3>
              <span className="font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Lista completa
              </span>
            </button>
          )}
        </div>
      )}

      {/* Lista compacta */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-[18px] bg-surf-2" />)}
        </div>
      ) : showItemsList && (
        <>
          {filtered.length === 0 ? (
            <EmptyState icon={UtensilsCrossed} title="Sin artículos"
              hint={search.trim() ? "Prueba con otra búsqueda." : "Agrega tu primer platillo para empezar."}
              action={<PrimaryBtn full={false} icon={Plus} onClick={() => openForm()}>Nuevo platillo</PrimaryBtn>} />
          ) : (
            <>
              {/* Tabla (desktop ≥ md) */}
              <WtCard className="hidden overflow-hidden p-0 md:block">
                <div className="grid grid-cols-12 gap-3 px-4 py-3 font-mono text-[10px] uppercase tracking-[.14em] text-tx-dim"
                  style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
                  <div className="col-span-1 flex items-center gap-2">
                    <input type="checkbox" className="cursor-pointer rounded accent-[var(--brand-primary)]"
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
                    <div key={item.id} className="grid grid-cols-12 items-center gap-3 px-4 py-3 transition-all"
                      style={{ borderBottom: "1px solid var(--bd-1)", background: sel ? "var(--iris-soft)" : idx % 2 === 0 ? "transparent" : "var(--surf-1)", opacity: item.isAvailable ? 1 : 0.5 }}>
                      <div className="col-span-1 flex items-center gap-2">
                        <input type="checkbox" className="cursor-pointer rounded accent-[var(--brand-primary)]"
                          checked={sel} onChange={() => toggleSelect(item.id)} />
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--surf-2)" }}>
                          {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={32} height={32} className={`h-full w-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <UtensilsCrossed size={15} className="text-tx-mut" />}
                        </div>
                      </div>
                      <div className="col-span-3 truncate font-display text-sm font-bold text-tx-hi">{item.name}</div>
                      <div className="col-span-2 text-xs font-medium text-tx-mut">{item.category?.name || "—"}</div>
                      <div className="col-span-1 text-right font-mono text-sm font-bold text-primary">${item.price}</div>
                      <div className="col-span-2 flex justify-center">
                        <button onClick={() => toggleAvailable(item)} aria-label={item.isAvailable ? "Desactivar" : "Activar"}>
                          <Pill tone={item.isAvailable ? "ok" : "err"}>{item.isAvailable ? "Activo" : "Inactivo"}</Pill>
                        </button>
                      </div>
                      <div className="col-span-3 flex justify-end gap-2">
                        <button onClick={() => openForm(item)} className="flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-tx-mut" style={{ border: "1px solid var(--bd-1)" }}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button onClick={() => deleteItem(item)} aria-label="Eliminar" className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </WtCard>

              {/* Tarjetas (mobile < md) */}
              <div className="flex flex-col gap-2 pb-2 md:hidden">
                {filtered.length > 0 && (
                  <button type="button" onClick={toggleSelectAll}
                    className="flex items-center gap-2 px-2 py-2 text-left">
                    <input type="checkbox" className="h-4 w-4 cursor-pointer rounded accent-[var(--brand-primary)]"
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll} onClick={e => e.stopPropagation()} />
                    <span className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                      Seleccionar todos
                    </span>
                  </button>
                )}
                {filtered.map((item) => {
                  const sel = selectedIds.has(item.id);
                  return (
                    <WtCard key={item.id} className="p-3"
                      style={{ borderColor: sel ? "var(--brand-primary)" : undefined, background: sel ? "var(--iris-soft)" : undefined, opacity: item.isAvailable ? 1 : 0.55 }}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded accent-[var(--brand-primary)]"
                          checked={sel} onChange={() => toggleSelect(item.id)} />
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl" style={{ background: "var(--surf-2)" }}>
                          {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={48} height={48} className={`h-full w-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <UtensilsCrossed size={20} className="text-tx-mut" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-display text-sm font-extrabold leading-tight text-tx-hi">{item.name}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-tx-mut">{item.category?.name || "—"}</span>
                            <span className="font-mono text-sm font-bold text-primary">${item.price}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button onClick={() => toggleAvailable(item)} aria-label={item.isAvailable ? "Desactivar" : "Activar"}>
                          <Pill tone={item.isAvailable ? "ok" : "err"}>{item.isAvailable ? "Activo" : "Inactivo"}</Pill>
                        </button>
                        <button onClick={() => openForm(item)} className="ml-auto flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-tx-mut" style={{ border: "1px solid var(--bd-1)" }}>
                          <Pencil size={13} /> Editar
                        </button>
                        <button onClick={() => deleteItem(item)} aria-label="Eliminar" className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </WtCard>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* Overlay IA Escaneo */}
      {scanState.active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
          <style>{`
            @keyframes ai-scan-bar {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(500%); }
            }
          `}</style>
          <WtCard className="flex w-full max-w-sm flex-col items-center gap-5 p-8 text-center">
            {scanState.error ? (
              <>
                <span className="grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "var(--err-soft)", color: "var(--err)" }}>
                  <AlertTriangle size={28} strokeWidth={2} />
                </span>
                <h2 className="font-display text-xl font-extrabold text-tx-hi">Error al escanear</h2>
                <p className="px-2 text-sm text-tx-mut">{scanState.error}</p>
                <PrimaryBtn full={false} onClick={() => setScanState({ active: false, currentFile: '', current: 0, total: 0, error: null })}>
                  Cerrar
                </PrimaryBtn>
              </>
            ) : (
              <>
                <span className="grid h-16 w-16 animate-bounce place-items-center rounded-2xl text-primary" style={{ background: "var(--iris-soft)" }}>
                  <Sparkles size={32} strokeWidth={2} />
                </span>
                <div>
                  <h2 className="font-display text-xl font-extrabold text-tx-hi">Analizando con IA…</h2>
                  <p className="mt-1 text-sm text-tx-mut">No cierres esta ventana</p>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surf-2)" }}>
                  <div className="h-full w-1/3 rounded-full"
                    style={{ background: "var(--brand-primary)", animation: "ai-scan-bar 1.5s infinite ease-in-out" }} />
                </div>
                <p className="text-xs text-tx-mut">
                  Procesando:{" "}
                  <span className="font-bold text-tx">{scanState.currentFile}</span>
                  {scanState.total > 0 && ` (${scanState.current} de ${scanState.total})`}
                </p>
                <div className="flex gap-2">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="h-2.5 w-2.5 animate-bounce rounded-full"
                      style={{ background: "var(--brand-primary)", animationDelay: `${i * 0.18}s` }} />
                  ))}
                </div>
              </>
            )}
          </WtCard>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-3 left-3 right-3 z-40 flex items-center gap-2 overflow-x-auto rounded-2xl px-3 py-2.5 warmtech-scrollbar sm:bottom-6 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:gap-3 sm:px-5 sm:py-3"
          style={{ background: "var(--surf-1)", border: "1px solid var(--brand-primary)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          <span className="flex-shrink-0 rounded-lg px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.1em] text-primary" style={{ background: "var(--iris-soft)" }}>
            {selectedIds.size} <span className="hidden sm:inline">seleccionado{selectedIds.size !== 1 ? "s" : ""}</span>
          </span>
          <button onClick={() => bulkToggleAvailable(true)}
            className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all"
            style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>
            <Power size={13} strokeWidth={2.2} /> Activar
          </button>
          <button onClick={() => bulkToggleAvailable(false)}
            className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}>
            <Power size={13} strokeWidth={2.2} /> Desactivar
          </button>
          <select onChange={e => { bulkChangeCategory(e.target.value); e.target.value = ""; }}
            defaultValue=""
            className="min-h-9 max-w-[140px] flex-shrink-0 rounded-xl px-3 text-xs font-bold text-tx outline-none sm:max-w-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
            <option value="" disabled>Mover a categoría…</option>
            {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={bulkDelete}
            className="flex min-h-9 flex-shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-all"
            style={{ background: "var(--err-soft)", color: "var(--err)" }}>
            <Trash2 size={13} /> <span className="hidden sm:inline">Eliminar</span>
          </button>
          <button onClick={() => setSelectedIds(new Set())} aria-label="Cerrar selección"
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl text-tx-mut transition-all"
            style={{ background: "var(--surf-2)" }}><X size={15} /></button>
        </div>
      )}

      {/* Modal Formulario */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="my-4 w-full max-w-lg p-0">
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <h2 className="font-display text-xl font-extrabold text-tx-hi">{editItem ? "Editar platillo" : "Nuevo platillo"}</h2>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut"
                style={{ background: "var(--surf-2)" }}><X size={16} /></button>
            </div>
            <form onSubmit={saveItem} className="flex flex-col gap-4 p-6">
              {/* Contenido del formulario */}
              <div>
                <label className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Imagen</label>
                {imagePreview && (
                  <>
                    <div className="relative mb-2 h-40 w-full overflow-hidden rounded-xl" style={{ background: "var(--surf-2)" }}>
                      <Image src={imagePreview} alt="preview" fill className={form.imageFit === "contain" ? "object-contain" : "object-cover"} />
                    </div>
                    <div className="mb-2 flex gap-2">
                      {([["cover","Rellenar","Recorta para llenar la tarjeta"],["contain","Ajustar","Muestra la foto completa"]] as const).map(([val,label,hint]) => {
                        const active = form.imageFit === val;
                        return (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setForm(p => ({...p, imageFit: val}))}
                            title={hint}
                            className="min-h-10 flex-1 rounded-xl px-3 text-xs font-bold transition-all"
                            style={{
                              background: active ? "var(--brand-primary)" : "transparent",
                              color: active ? "#fffaf4" : "var(--tx-mut)",
                              border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                <label className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-xs font-bold text-tx-mut"
                  style={{ border: "1px solid var(--bd-1)" }}>
                  <ImagePlus size={15} /> Subir foto
                  <input type="file" accept="image/*" onChange={handleImageFile} className="hidden" />
                </label>
                <input value={form.imageUrl} onChange={e => { setForm(p=>({...p,imageUrl:e.target.value})); setImagePreview(e.target.value); setImageFile(null); }}
                  placeholder="o pega URL"
                  className="mt-2 min-h-11 w-full rounded-xl px-3 text-sm text-tx outline-none"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Nombre</label>
                  <input placeholder="Hamburguesa" value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} required className="min-h-11 w-full rounded-xl px-4 text-sm text-tx outline-none" style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Precio Base</label>
                  <input placeholder="89.00" value={form.price} onChange={e => setForm(p => ({...p,price:e.target.value}))} required type="number" className="min-h-11 w-full rounded-xl px-4 text-sm text-tx outline-none" style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }} />
                </div>
                <div className="col-span-2">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Categoría</label>
                  <div className="flex gap-2">
                    <select
                      value={form.categoryId}
                      onChange={e => setForm(p=>({...p,categoryId:e.target.value}))}
                      required={!showNewCat}
                      className="min-h-11 flex-1 rounded-xl px-4 text-sm text-tx outline-none"
                      style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }}
                    >
                      <option value="">Seleccionar…</option>
                      {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      type="button"
                      onClick={() => { setShowNewCat(s => !s); setNewCatName(""); }}
                      className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-bold transition-all"
                      style={{
                        background: showNewCat ? "var(--brand-primary)" : "transparent",
                        color: showNewCat ? "#fffaf4" : "var(--brand-primary)",
                        border: "1px solid var(--brand-primary)",
                      }}
                      aria-label="Crear nueva categoría"
                    >
                      {showNewCat ? <><X size={13} /> Cerrar</> : <><Plus size={13} /> Nueva</>}
                    </button>
                  </div>

                  {showNewCat && (
                    <div className="mt-2 flex gap-2 rounded-xl p-2" style={{ background: "var(--surf-2)", border: "1px dashed var(--brand-primary)" }}>
                      <input
                        autoFocus
                        value={newCatName}
                        onChange={e => setNewCatName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { e.preventDefault(); createCategoryInline(); }
                          if (e.key === "Escape") { setShowNewCat(false); setNewCatName(""); }
                        }}
                        placeholder="Nombre de la nueva categoría"
                        className="min-h-10 flex-1 rounded-lg px-3 text-sm text-tx outline-none"
                        style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)" }}
                      />
                      <button
                        type="button"
                        onClick={createCategoryInline}
                        disabled={creatingCat || !newCatName.trim()}
                        className="min-h-10 rounded-lg px-4 text-xs font-bold text-white transition-all disabled:opacity-50"
                        style={{ background: "var(--brand-primary)" }}
                      >
                        {creatingCat ? "…" : "Crear"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Seleccion multiple de variantes */}
                <div className="col-span-2">
                  <label className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                    Selección de Variantes
                  </label>
                  <button
                    type="button"
                    onClick={() => setForm(p => ({ ...p, variantMultiSelect: !p.variantMultiSelect }))}
                    className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all"
                    style={{
                      background: form.variantMultiSelect ? "var(--iris-soft)" : "var(--surf-2)",
                      border: `1.5px solid ${form.variantMultiSelect ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    }}
                  >
                    <div>
                      <span className="font-bold text-tx">Permitir elegir varias</span>
                      <p className="mt-0.5 text-xs text-tx-mut">Para sabores que se combinan (ej. 1kg de boneless con 3 sabores).</p>
                    </div>
                    <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded"
                      style={{ background: form.variantMultiSelect ? "var(--brand-primary)" : "var(--surf-1)", border: `1px solid ${form.variantMultiSelect ? "var(--brand-primary)" : "var(--bd-1)"}` }}>
                      {form.variantMultiSelect && <Check size={12} strokeWidth={3} className="text-white" />}
                    </span>
                  </button>
                  {form.variantMultiSelect && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block font-mono text-[9px] uppercase tracking-[.1em] text-tx-mut">Mínimo (0 = opcional)</label>
                        <input type="number" min={0} value={form.variantMinSelection} onChange={e => setForm(p => ({ ...p, variantMinSelection: Math.max(0, parseInt(e.target.value,10) || 0) }))} className="min-h-11 w-full rounded-xl px-4 text-sm text-tx outline-none" style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }} />
                      </div>
                      <div>
                        <label className="mb-1 block font-mono text-[9px] uppercase tracking-[.1em] text-tx-mut">Máximo (0 = sin tope)</label>
                        <input type="number" min={0} value={form.variantMaxSelection} onChange={e => setForm(p => ({ ...p, variantMaxSelection: Math.max(0, parseInt(e.target.value,10) || 0) }))} className="min-h-11 w-full rounded-xl px-4 text-sm text-tx outline-none" style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Grupos de Variantes */}
                <div className="col-span-2">
                  <label className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                    Grupos de Variantes <span className="font-sans normal-case tracking-normal text-tx-dim">(Opcional)</span>
                  </label>
                  {variantTemplates.length === 0 ? (
                    <p className="px-1 text-xs text-tx-mut">
                      Sin grupos creados.{" "}
                      <a href="/admin/menu/variantes" target="_blank" className="font-bold text-primary">Crear grupos →</a>
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
                            className="flex items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition-all"
                            style={{
                              background: selected ? "var(--iris-soft)" : "var(--surf-2)",
                              border: `1.5px solid ${selected ? "var(--brand-primary)" : "var(--bd-1)"}`,
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded"
                                style={{ background: selected ? "var(--brand-primary)" : "var(--surf-1)", border: `1px solid ${selected ? "var(--brand-primary)" : "var(--bd-1)"}` }}>
                                {selected && <Check size={12} strokeWidth={3} className="text-white" />}
                              </span>
                              <span className="font-bold text-tx">{tpl.name}</span>
                            </div>
                            <span className="text-xs text-tx-mut">
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
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                      Modificadores <span className="font-sans normal-case tracking-normal text-tx-dim">(Sin costo o con extra)</span>
                    </label>
                    <ModifierGroupsEditor itemId={editItem.id} />
                  </div>
                )}

                {/* Promoción por día */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between py-1">
                    <span className="font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Promoción por día</span>
                    <Toggle checked={form.isPromo} onChange={() => setForm(p => ({ ...p, isPromo: !p.isPromo }))} label="Promoción por día" />
                  </div>
                  {form.isPromo && (
                    <div className="mt-3 grid gap-3">
                      <div>
                        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">
                          Precio promocional
                        </label>
                        <input
                          type="number"
                          min="0.01"
                          max={form.price ? Math.max(0.01, Number(form.price) - 0.01) : undefined}
                          step="0.01"
                          value={form.promoPrice}
                          onChange={e => setForm(p => ({ ...p, promoPrice: e.target.value }))}
                          placeholder="Ej. 79.00"
                          required
                          className="min-h-11 w-full rounded-xl px-3 font-mono text-sm font-bold text-tx outline-none"
                          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                        />
                      </div>
                      <div className="flex flex-wrap gap-1.5">
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
                              className="min-h-10 rounded-lg px-3 text-xs font-bold transition-all"
                              style={{
                                background: active ? "var(--brand-primary)" : "var(--surf-2)",
                                color: active ? "#fffaf4" : "var(--tx-mut)",
                                border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`
                              }}>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <PrimaryBtn ghost onClick={() => setShowForm(false)}>Cancelar</PrimaryBtn>
                <PrimaryBtn type="submit" disabled={saving || uploading} icon={Check}>Guardar</PrimaryBtn>
              </div>
            </form>
          </WtCard>
        </div>
      )}

      {/* Zona de peligro — Wipe del menú */}
      {!loading && (
        <SectionLabel>Zona de peligro</SectionLabel>
      )}
      {!loading && (
        <WtCard className="mb-6 p-4 md:p-5" style={{ borderColor: "var(--err)", background: "var(--err-soft)" }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <IconBadge icon={AlertTriangle} tone="err" size={34} />
              <div>
                <h3 className="font-display text-sm font-extrabold uppercase tracking-wider" style={{ color: "var(--err)" }}>Zona de peligro</h3>
                <p className="mt-1 text-xs text-tx-mut">
                  Borra todo el menú del restaurante (platillos, categorías y grupos de variantes). Útil para volver a generarlo con IA desde cero.
                </p>
              </div>
            </div>
            <button type="button" onClick={() => { setShowWipe(true); setWipeConfirm(""); }}
              className="flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-4 text-xs font-bold transition-all"
              style={{ border: "1px solid var(--err)", color: "var(--err)" }}>
              <Trash2 size={14} /> Borrar todo el menú
            </button>
          </div>
        </WtCard>
      )}

      {/* Modal confirmación wipe */}
      {showWipe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="w-full max-w-md p-0" style={{ borderColor: "var(--err)" }}>
            <div className="flex flex-col gap-4 p-5 sm:p-6">
              <div className="flex items-center gap-3">
                <IconBadge icon={AlertTriangle} tone="err" size={40} />
                <h2 className="font-display text-lg font-extrabold sm:text-xl" style={{ color: "var(--err)" }}>Borrar todo el menú</h2>
              </div>
              <p className="text-sm text-tx-mut">
                Esta acción <strong className="text-tx">no se puede deshacer</strong>. Se eliminarán todos los platillos, categorías y grupos de variantes de este restaurante, junto con sus referencias en órdenes pasadas.
              </p>
              <p className="text-xs text-tx-mut">Escribe <strong style={{ color: "var(--err)" }}>BORRAR</strong> para confirmar:</p>
              <input
                autoFocus
                value={wipeConfirm}
                onChange={e => setWipeConfirm(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && wipeConfirm === 'BORRAR') wipeAllMenu(); if (e.key === 'Escape') setShowWipe(false); }}
                placeholder="BORRAR"
                className="min-h-11 w-full rounded-xl px-4 text-sm text-tx outline-none"
                style={{ background: "var(--surf-2)", border: "1.5px solid var(--bd-1)" }}
              />
              <div className="mt-2 flex gap-3">
                <PrimaryBtn ghost onClick={() => { setShowWipe(false); setWipeConfirm(""); }}>
                  Cancelar
                </PrimaryBtn>
                <button type="button" onClick={wipeAllMenu} disabled={wipeConfirm !== "BORRAR" || wiping}
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[13px] px-4 text-[13px] font-bold text-white transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ background: "var(--err)" }}>
                  {wiping ? "Borrando…" : "Borrar todo"}
                </button>
              </div>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
