"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Bot, Plus, Search, X, UtensilsCrossed, ImagePlus, ChevronLeft,
} from "lucide-react";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { uploadMenuImage } from "@/lib/supabaseUpload";
import { extractErrorMessage } from "@/lib/errors";
import {
  PageShell, PageHeader, PageTabs, Card, Button, EmptyState, useToast, useConfirm,
} from "@/components/ds";
import { CategoriesGrid } from "./_components/CategoriesGrid";
import { ItemsTable } from "./_components/ItemsTable";
import { BulkActionBar } from "./_components/BulkActionBar";
import { AiScanOverlay } from "./_components/AiScanOverlay";
import { ItemFormModal } from "./_components/ItemFormModal";
import { WipeMenuDialog } from "./_components/WipeMenuDialog";
import type { EditableCtl } from "./_components/EditableList";

export default function MenuPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [variantTemplates, setVariantTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, promoPrice:"", activeDays:[] as string[], variantTemplateIds:[] as string[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0, availableOnline:true, availableOnKiosk:true, isCombo:false, saleUnit:"PIECE", unit:"pz" });
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
  // Grupos de variantes aplicados al abrir el form. Sirve para decidir si el
  // guardado debe re-sincronizar plantillas: solo mandamos variantTemplateIds
  // cuando hay (o había) grupos. Si el producto usa variantes DIRECTAS sin
  // grupos, omitirlo evita que el sync destructivo del backend las borre.
  const [initialTemplateIds, setInitialTemplateIds] = useState<string[]>([]);

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
      // admin=true: es la pantalla de GESTIÓN del menú, debe ver TODO
      // (promos sin días, no disponibles, categorías inactivas). Sin esto el
      // endpoint público oculta los combos isPromo sin activeDays y la
      // categoría se ve vacía ("0 artículos en Día del Padre").
      const [i, c, vt] = await Promise.all([
        api.get("/api/menu/items?admin=true"),
        api.get("/api/menu/categories?admin=true"),
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
      setForm({ name:item.name, description:item.description||"", price:String(item.price), categoryId:item.categoryId, isPopular:item.isPopular, imageUrl:item.imageUrl||"", imageFit:item.imageFit||"cover", isPromo:item.isPromo||false, promoPrice:item.promoPrice == null ? "" : String(item.promoPrice), activeDays:item.activeDays||[], variantTemplateIds:[], variantMultiSelect:!!item.variantMultiSelect, variantMinSelection:item.variantMinSelection??0, variantMaxSelection:item.variantMaxSelection??0, availableOnline:item.availableOnline ?? true, availableOnKiosk:item.availableOnKiosk ?? true, isCombo:item.isCombo ?? false, saleUnit:(item.saleUnit || (item.soldByWeight ? "WEIGHT" : "PIECE")), unit:(item.unit || "pz") });
      setImagePreview(item.imageUrl||"");
      api.get(`/api/menu/items/${item.id}`).then(r => {
        setComplements(r.data.complements || []);
        setVariants(r.data.variants || []);
        const tplIds = (r.data.variantTemplates || r.data.appliedTemplates || []).map((t: any) => t.id ?? t.variantTemplateId).filter(Boolean);
        setForm(p => ({ ...p, variantTemplateIds: tplIds }));
        setInitialTemplateIds(tplIds);
      }).catch(() => { setComplements([]); setVariants([]); setInitialTemplateIds([]); });
    } else {
      setEditItem(null);
      setForm({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", imageFit:"cover", isPromo:false, promoPrice:"", activeDays:[], variantTemplateIds:[], variantMultiSelect:false, variantMinSelection:0, variantMaxSelection:0, availableOnline:true, availableOnKiosk:true, isCombo:false, saleUnit:"PIECE", unit:"pz" });
      setImagePreview("");
      setComplements([]);
      setVariants([]);
      setInitialTemplateIds([]);
    }
    setNewComp({ name: '', price: '' });
    setNewVariant({ name: '', price: '' });
    setEditingComp(null);
    setEditingVariant(null);
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

  function handleImageUrlChange(value: string) {
    setForm(p => ({ ...p, imageUrl: value }));
    setImagePreview(value);
    setImageFile(null);
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
      toast.error(e?.response?.data?.error || "No se pudo crear la categoría");
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
      toast.error(e.response?.data?.error || 'Error al agregar variante');
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
    } catch { toast.error('Error al guardar variante'); }
  }

  async function deleteVariant(id: string) {
    if (!(await confirm({ title: '¿Eliminar esta variante?', danger: true, confirmLabel: 'Eliminar' }))) return;
    try {
      await api.delete(`/api/menu/variants/${id}`);
      setVariants(p => p.filter(v => v.id !== id));
    } catch { toast.error('Error al eliminar'); }
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
      toast.error(e.response?.data?.error || 'Error al agregar');
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
    } catch { toast.error('Error al guardar'); }
  }

  async function deleteComplement(id: string) {
    if (!(await confirm({ title: '¿Eliminar este complemento?', danger: true, confirmLabel: 'Eliminar' }))) return;
    try {
      await api.delete(`/api/menu/items/complements/${id}`);
      setComplements(p => p.filter(m => m.id !== id));
    } catch { toast.error('Error al eliminar'); }
  }

  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    const regularPrice = Number(form.price);
    const promoPrice = Number(form.promoPrice);
    if (form.isPromo && (!form.promoPrice || !Number.isFinite(promoPrice) || promoPrice <= 0 || promoPrice >= regularPrice)) {
      toast.error("El precio promocional debe ser mayor a 0 y menor al precio regular.");
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadImageToCloud();
      const payload: any = {
        ...form,
        price: regularPrice,
        promoPrice: form.isPromo ? promoPrice : null,
        imageUrl,
      };
      // El backend re-sincroniza (borra y recrea) las variantes a partir de
      // variantTemplateIds cada vez que el campo viaja en el body. Si el
      // producto NO usa grupos (ni ahora ni antes), omitimos el campo para no
      // disparar ese borrado: las variantes DIRECTAS (chica/grande) se
      // gestionan aparte por sus propios endpoints y deben sobrevivir al guardar.
      const usesTemplates = form.variantTemplateIds.length > 0 || initialTemplateIds.length > 0;
      if (!usesTemplates) delete payload.variantTemplateIds;
      if (editItem) await api.put(`/api/menu/items/${editItem.id}`, payload);
      else await api.post("/api/menu/items", payload);
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      toast.error(extractErrorMessage(err, "Error al guardar"));
    } finally { setSaving(false); }
  }

  async function deleteItem(item: any) {
    if (!(await confirm({ title: `¿Eliminar "${item.name}"?`, danger: true, confirmLabel: 'Eliminar' }))) return;
    try {
      await api.delete(`/api/menu/items/${item.id}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Error al eliminar');
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
    if (!(await confirm({ title: `¿Eliminar ${selectedIds.size} platillo(s)?`, body: 'Esta acción no se puede deshacer.', danger: true, confirmLabel: 'Eliminar' }))) return;
    const results = await Promise.allSettled(
      [...selectedIds].map(id => api.delete(`/api/menu/items/${id}`))
    );
    const failed = results.filter(r => r.status === 'rejected');
    setSelectedIds(new Set());
    fetchData();
    if (failed.length > 0) {
      const firstErr: any = (failed[0] as PromiseRejectedResult).reason;
      const msg = firstErr?.response?.data?.error || firstErr?.message || 'Error desconocido';
      toast.error(`No se pudieron eliminar ${failed.length} de ${results.length} platillo(s). Motivo: ${msg}`);
    }
  }

  async function wipeAllMenu() {
    if (wipeConfirm !== "BORRAR") return;
    setWiping(true);
    try {
      const { data } = await api.post('/api/menu/wipe-all', { confirm: 'BORRAR' });
      const d = data?.deleted || {};
      toast.success(`Menú borrado: ${d.menuItems || 0} platillos, ${d.categories || 0} categorías, ${d.variantTemplates || 0} grupos de variantes, ${d.orderItems || 0} líneas de orden afectadas.`);
      setShowWipe(false);
      setWipeConfirm("");
      setSelectedIds(new Set());
      setDrillCategoryId(null);
      setView("categories");
      fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Error al borrar el menú');
    } finally {
      setWiping(false);
    }
  }
  async function bulkChangeCategory(categoryId: string) {
    if (!categoryId) return;
    await Promise.all([...selectedIds].map(id => api.put(`/api/menu/items/${id}`, { categoryId }).catch(() => {})));
    setSelectedIds(new Set()); fetchData();
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

  const variantsCtl: EditableCtl = {
    items: variants,
    newItem: newVariant, setNewItem: setNewVariant,
    onAdd: addVariant, saving: savingVariant,
    editingId: editingVariant, editForm: editVariantForm, setEditForm: setEditVariantForm,
    onStartEdit: startEditVariant, onSaveEdit: saveEditVariant, onCancelEdit: () => setEditingVariant(null), onDelete: deleteVariant,
  };
  const complementsCtl: EditableCtl = {
    items: complements,
    newItem: newComp, setNewItem: setNewComp,
    onAdd: addComplement, saving: savingComp,
    editingId: editingComp, editForm: editCompForm, setEditForm: setEditCompForm,
    onStartEdit: startEditComp, onSaveEdit: saveEditComp, onCancelEdit: () => setEditingComp(null), onDelete: deleteComplement,
  };

  return (
    <PageShell width="wide">
      <PageHeader
        eyebrow="Catálogo"
        title="Menú"
        subtitle="Gestión de artículos y categorías"
        actions={
          <>
            <label className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-ds-md px-4 text-[13px] font-bold transition-transform active:scale-[.98] ${scanState.active ? "cursor-not-allowed opacity-60" : ""}`}
              style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", color: "var(--accent-contrast)", boxShadow: "0 6px 18px var(--accent-glow)" }}>
              <Bot size={16} strokeWidth={2} /> Escaneo IA
              {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
            </label>
            <Button variant="secondary" icon={ImagePlus} href="/admin/menu/fotos">Subir fotos en lote</Button>
            <Button variant="secondary" icon={Plus} onClick={() => openForm()}>Nuevo platillo</Button>
          </>
        }
      />

      <PageTabs set="menu" />

      {/* Acciones (móvil) */}
      <div className="mb-4 flex gap-2 md:hidden">
        <label className={`flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-ds-md px-3 text-xs font-bold transition-transform active:scale-[.98] ${scanState.active ? "cursor-not-allowed opacity-60" : ""}`}
          style={{ background: "linear-gradient(140deg,var(--brand-secondary),var(--brand-primary))", color: "var(--accent-contrast)", boxShadow: "0 6px 18px var(--accent-glow)" }}>
          <Bot size={15} strokeWidth={2} /> Escaneo IA
          {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
        </label>
        <button type="button" onClick={() => openForm()}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-ds-md px-3 text-xs font-bold text-tx"
          style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}>
          <Plus size={15} strokeWidth={2.2} /> Nuevo platillo
        </button>
      </div>

      {/* Acceso directo a carga de fotos en lote (móvil) */}
      <Link href="/admin/menu/fotos"
        className="mb-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-ds-md px-3 text-xs font-bold text-tx md:hidden"
        style={{ background: "var(--surf-2)", border: "1px solid var(--bd-2)" }}>
        <ImagePlus size={15} strokeWidth={2.2} /> Subir fotos en lote
      </Link>

      {/* Barra de búsqueda + breadcrumb */}
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[160px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tx-mut" />
          <input value={search} onChange={e => { setSearch(e.target.value); if (e.target.value.trim()) setView("products"); }}
            placeholder="Buscar platillos o categorías…"
            className="min-h-11 w-full rounded-ds-md pl-9 pr-3 text-sm text-tx outline-none"
            style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }} />
        </div>
        {search.trim() && (
          <Button variant="danger" icon={X}
            onClick={() => { setSearch(""); setView("categories"); setDrillCategoryId(null); }}>
            Limpiar
          </Button>
        )}
        {!search.trim() && view === "products" && (
          <Button variant="secondary" icon={ChevronLeft}
            onClick={() => { setView("categories"); setDrillCategoryId(null); setFilterCat("all"); }}>
            Categorías
          </Button>
        )}
        <span className="px-1 text-xs font-bold text-tx-mut">
          {showCategoriesGrid
            ? `${filteredCats.length} categorías`
            : `${filtered.length} artículos${activeDrillCat ? ` en ${activeDrillCat.name}` : ""}`}
        </span>
      </Card>

      {/* Grid de categorías (drill-down landing) */}
      {!loading && showCategoriesGrid && (
        <CategoriesGrid
          cats={filteredCats}
          itemCountByCat={itemCountByCat}
          totalItems={items.length}
          showAllTile={!search.trim()}
          onOpenCategory={(id) => { setDrillCategoryId(id); setView("products"); setFilterCat("all"); }}
          onOpenAll={() => { setDrillCategoryId(null); setView("products"); setFilterCat("all"); }}
        />
      )}

      {/* Lista compacta */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-ds-xl bg-surf-2" />)}
        </div>
      ) : showItemsList && (
        <>
          {filtered.length === 0 ? (
            <EmptyState icon={UtensilsCrossed} title="Sin artículos"
              hint={search.trim() ? "Prueba con otra búsqueda." : "Agrega tu primer platillo para empezar."}
              action={<Button icon={Plus} onClick={() => openForm()}>Nuevo platillo</Button>} />
          ) : (
            <ItemsTable
              items={filtered}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleSelectAll={toggleSelectAll}
              onToggleAvailable={toggleAvailable}
              onEdit={openForm}
              onDelete={deleteItem}
            />
          )}
        </>
      )}

      {/* Overlay IA Escaneo */}
      <AiScanOverlay scan={scanState} onReset={() => setScanState({ active: false, currentFile: '', current: 0, total: 0, error: null })} />

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          cats={cats}
          onActivate={() => bulkToggleAvailable(true)}
          onDeactivate={() => bulkToggleAvailable(false)}
          onChangeCategory={bulkChangeCategory}
          onDelete={bulkDelete}
          onClear={() => setSelectedIds(new Set())}
        />
      )}

      {/* Modal Formulario */}
      <ItemFormModal
        open={showForm}
        onClose={() => setShowForm(false)}
        editItem={editItem}
        form={form}
        setForm={setForm}
        cats={cats}
        variantTemplates={variantTemplates}
        items={items}
        imagePreview={imagePreview}
        onImageFile={handleImageFile}
        onImageUrlChange={handleImageUrlChange}
        saving={saving}
        uploading={uploading}
        onSubmit={saveItem}
        showNewCat={showNewCat}
        setShowNewCat={setShowNewCat}
        newCatName={newCatName}
        setNewCatName={setNewCatName}
        creatingCat={creatingCat}
        onCreateCategory={createCategoryInline}
        variantsCtl={variantsCtl}
        complementsCtl={complementsCtl}
      />

      {/* Zona de peligro — Wipe del menú */}
      {!loading && (
        <WipeMenuDialog
          open={showWipe}
          wipeConfirm={wipeConfirm}
          wiping={wiping}
          onOpen={() => { setShowWipe(true); setWipeConfirm(""); }}
          onClose={() => { setShowWipe(false); setWipeConfirm(""); }}
          onWipeConfirmChange={setWipeConfirm}
          onConfirm={wipeAllMenu}
        />
      )}
    </PageShell>
  );
}
