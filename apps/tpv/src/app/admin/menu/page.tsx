"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { getApiUrl } from "@/lib/config";
import { uploadMenuImage } from "@/lib/upload";
import ModifierGroupsEditor from "@/components/admin/ModifierGroupsEditor";
import BackButton from "@/components/BackButton";
import {
  Check,
  Copy,
  Edit2,
  Folder,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Save,
  Search,
  Settings2,
  Sparkles,
  Star,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

type Category = {
  id: string;
  name: string;
  isActive?: boolean;
};

type MenuItemVariant = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type MenuItemComplement = {
  id: string;
  name: string;
  price: number;
  isAvailable: boolean;
};

type VariantTemplateOption = {
  id: string;
  name: string;
  price: number;
};

type VariantTemplate = {
  id: string;
  name: string;
  options: VariantTemplateOption[];
};

type MenuItem = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  imageFit?: string | null;
  price: number;
  categoryId: string;
  isAvailable: boolean;
  isPopular?: boolean;
  isFavorite?: boolean;
  isPromo?: boolean;
  activeDays?: string[];
  category?: Category;
  variants?: MenuItemVariant[];
  complements?: MenuItemComplement[];
  variantTemplates?: { id: string; name: string }[];
  variantMultiSelect?: boolean;
  variantMinSelection?: number;
  variantMaxSelection?: number;
};

type ProductForm = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string;
  imageFit: string;
  isAvailable: boolean;
  isPopular: boolean;
  isFavorite: boolean;
  isPromo: boolean;
  activeDays: string[];
  variantTemplateIds: string[];
  variantMultiSelect: boolean;
  variantMinSelection: number;
  variantMaxSelection: number;
};

type Section = "products" | "categories" | "variants";
type EditorTab = "basic" | "variants" | "extras" | "modifiers";

const emptyForm: ProductForm = {
  name: "",
  description: "",
  price: "",
  categoryId: "",
  imageUrl: "",
  imageFit: "cover",
  isAvailable: true,
  isPopular: false,
  isFavorite: false,
  isPromo: false,
  activeDays: [],
  variantTemplateIds: [],
  variantMultiSelect: false,
  variantMinSelection: 0,
  variantMaxSelection: 0,
};

const days = [
  ["MONDAY", "Lun"],
  ["TUESDAY", "Mar"],
  ["WEDNESDAY", "Mie"],
  ["THURSDAY", "Jue"],
  ["FRIDAY", "Vie"],
  ["SATURDAY", "Sab"],
  ["SUNDAY", "Dom"],
] as const;

export default function MenuEditorPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<VariantTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>("products");
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>("basic");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [newOption, setNewOption] = useState({ name: "", price: "" });
  const [newVariant, setNewVariant] = useState({ name: "", price: "" });
  const [newComplement, setNewComplement] = useState({ name: "", price: "" });
  const [scanState, setScanState] = useState<{ active: boolean; label: string; error?: string }>({
    active: false,
    label: "",
  });

  async function fetchData() {
    setLoading(true);
    try {
      const [itemsRes, catsRes, tplRes] = await Promise.allSettled([
        api.get("/api/menu/items?admin=true"),
        api.get("/api/menu/categories?admin=true"),
        api.get("/api/menu/variant-templates"),
      ]);
      if (itemsRes.status === "fulfilled") {
        setItems(Array.isArray(itemsRes.value.data) ? itemsRes.value.data : []);
      } else {
        console.error(itemsRes.reason);
        toast.error("No se pudieron cargar los productos");
      }
      if (catsRes.status === "fulfilled") {
        setCategories(Array.isArray(catsRes.value.data) ? catsRes.value.data : []);
      } else {
        console.error(catsRes.reason);
        toast.error("No se pudieron cargar las categorias");
      }
      if (tplRes.status === "fulfilled") {
        setTemplates(Array.isArray(tplRes.value.data) ? tplRes.value.data : []);
      } else {
        console.error(tplRes.reason);
        toast.error("No se pudieron cargar las variantes");
      }
    } catch (error) {
      console.error(error);
      toast.error("No se pudo cargar el menu");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) fetchData();
    });
    return () => { cancelled = true; };
  }, []);

  const selectedTemplate = templates.find((tpl) => tpl.id === selectedTemplateId) || templates[0] || null;

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q) ||
        (item.category?.name || "").toLowerCase().includes(q);
      const matchesCat = filterCat === "all" || item.categoryId === filterCat;
      return matchesSearch && matchesCat;
    });
  }, [items, search, filterCat]);

  const stats = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((item) => item.isAvailable).length,
      favorites: items.filter((item) => item.isFavorite).length,
      promos: items.filter((item) => item.isPromo).length,
    };
  }, [items]);

  function openEditor(item?: MenuItem) {
    setEditingItem(item || null);
    setEditorTab("basic");
    setImageFile(null);
    if (item) {
      setForm({
        name: item.name || "",
        description: item.description || "",
        price: String(item.price ?? ""),
        categoryId: item.categoryId || categories[0]?.id || "",
        imageUrl: item.imageUrl || "",
        imageFit: item.imageFit || "cover",
        isAvailable: item.isAvailable !== false,
        isPopular: !!item.isPopular,
        isFavorite: !!item.isFavorite,
        isPromo: !!item.isPromo,
        activeDays: item.activeDays || [],
        variantTemplateIds: item.variantTemplates?.map((tpl) => tpl.id) || [],
        variantMultiSelect: !!item.variantMultiSelect,
        variantMinSelection: item.variantMinSelection ?? 0,
        variantMaxSelection: item.variantMaxSelection ?? 0,
      });
      api.get(`/api/menu/items/${item.id}`).then(({ data }) => {
        setEditingItem(data);
        setForm((prev) => ({
          ...prev,
          variantTemplateIds: data.variantTemplates?.map((tpl: { id: string }) => tpl.id) || prev.variantTemplateIds,
        }));
      }).catch(() => undefined);
    } else {
      setForm({ ...emptyForm, categoryId: categories[0]?.id || "" });
    }
    setEditorOpen(true);
  }

  async function saveProduct(e?: FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) return toast.error("El producto necesita nombre");
    if (!form.categoryId) return toast.error("Selecciona una categoria");
    setSaving(true);
    try {
      const imageUrl = imageFile ? await uploadMenuImage(imageFile) : form.imageUrl.trim();
      const payload = {
        ...form,
        name: form.name.trim(),
        description: form.description.trim(),
        imageUrl,
        price: parseFloat(form.price) || 0,
      };
      if (editingItem?.id) {
        await api.put(`/api/menu/items/${editingItem.id}`, payload);
        toast.success("Producto actualizado");
      } else {
        await api.post("/api/menu/items", payload);
        toast.success("Producto creado");
      }
      setEditorOpen(false);
      setEditingItem(null);
      await fetchData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Error al guardar";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteItem(item: MenuItem) {
    if (!confirm(`Eliminar "${item.name}"?`)) return;
    await api.delete(`/api/menu/items/${item.id}`);
    toast.success("Producto eliminado");
    await fetchData();
  }

  async function patchItem(item: MenuItem, patch: Partial<MenuItem>) {
    await api.put(`/api/menu/items/${item.id}`, patch);
    setItems((prev) => prev.map((curr) => curr.id === item.id ? { ...curr, ...patch } : curr));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkPatch(patch: Partial<MenuItem>) {
    await Promise.all([...selectedIds].map((id) => api.put(`/api/menu/items/${id}`, patch)));
    setSelectedIds(new Set());
    await fetchData();
  }

  async function bulkDelete() {
    if (!confirm(`Eliminar ${selectedIds.size} producto(s)?`)) return;
    await Promise.all([...selectedIds].map((id) => api.delete(`/api/menu/items/${id}`)));
    setSelectedIds(new Set());
    await fetchData();
  }

  async function createCategory() {
    const name = newCategoryName.trim();
    if (!name) return;
    await api.post("/api/menu/categories", { name });
    setNewCategoryName("");
    await fetchData();
  }

  async function renameCategory(category: Category) {
    const name = prompt("Nuevo nombre:", category.name)?.trim();
    if (!name) return;
    await api.put(`/api/menu/categories/${category.id}`, { name });
    await fetchData();
  }

  async function deleteCategory(category: Category) {
    const count = items.filter((item) => item.categoryId === category.id).length;
    if (count > 0) return toast.error(`Mueve primero ${count} producto(s) de esta categoria`);
    if (!confirm(`Eliminar "${category.name}"?`)) return;
    await api.delete(`/api/menu/categories/${category.id}`);
    await fetchData();
  }

  async function createTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;
    const { data } = await api.post("/api/menu/variant-templates", { name, options: [] });
    setNewTemplateName("");
    setSelectedTemplateId(data.id);
    await fetchData();
  }

  async function renameTemplate(template: VariantTemplate) {
    const name = prompt("Nuevo nombre:", template.name)?.trim();
    if (!name) return;
    await api.put(`/api/menu/variant-templates/${template.id}`, { name });
    await fetchData();
  }

  async function deleteTemplate(template: VariantTemplate) {
    if (!confirm(`Eliminar grupo "${template.name}"?`)) return;
    await api.delete(`/api/menu/variant-templates/${template.id}`);
    setSelectedTemplateId(null);
    await fetchData();
  }

  async function addTemplateOption() {
    if (!selectedTemplate || !newOption.name.trim()) return;
    await api.post(`/api/menu/variant-templates/${selectedTemplate.id}/options`, {
      name: newOption.name.trim(),
      price: parseFloat(newOption.price) || 0,
    });
    setNewOption({ name: "", price: "" });
    await fetchData();
  }

  async function editTemplateOption(option: VariantTemplateOption) {
    const name = prompt("Opcion:", option.name)?.trim();
    if (!name) return;
    const price = prompt("Precio adicional:", String(option.price));
    await api.put(`/api/menu/variant-templates/options/${option.id}`, {
      name,
      price: parseFloat(price || "0") || 0,
    });
    await fetchData();
  }

  async function deleteTemplateOption(option: VariantTemplateOption) {
    if (!confirm(`Eliminar opcion "${option.name}"?`)) return;
    await api.delete(`/api/menu/variant-templates/options/${option.id}`);
    await fetchData();
  }

  function toggleTemplate(tplId: string) {
    setForm((prev) => ({
      ...prev,
      variantTemplateIds: prev.variantTemplateIds.includes(tplId)
        ? prev.variantTemplateIds.filter((id) => id !== tplId)
        : [...prev.variantTemplateIds, tplId],
    }));
  }

  async function addVariant() {
    if (!editingItem?.id) return toast.error("Guarda el producto primero");
    if (!newVariant.name.trim()) return;
    const { data } = await api.post(`/api/menu/${editingItem.id}/variants`, {
      name: newVariant.name.trim(),
      price: parseFloat(newVariant.price) || 0,
    });
    setEditingItem((prev) => prev ? { ...prev, variants: [...(prev.variants || []), data] } : prev);
    setNewVariant({ name: "", price: "" });
  }

  async function deleteVariant(id: string) {
    await api.delete(`/api/menu/variants/${id}`);
    setEditingItem((prev) => prev ? { ...prev, variants: prev.variants?.filter((variant) => variant.id !== id) } : prev);
  }

  async function addComplement() {
    if (!editingItem?.id) return toast.error("Guarda el producto primero");
    if (!newComplement.name.trim()) return;
    const { data } = await api.post(`/api/menu/items/${editingItem.id}/complements`, {
      name: newComplement.name.trim(),
      price: parseFloat(newComplement.price) || 0,
    });
    setEditingItem((prev) => prev ? { ...prev, complements: [...(prev.complements || []), data] } : prev);
    setNewComplement({ name: "", price: "" });
  }

  async function deleteComplement(id: string) {
    await api.delete(`/api/menu/items/complements/${id}`);
    setEditingItem((prev) => prev ? { ...prev, complements: prev.complements?.filter((comp) => comp.id !== id) } : prev);
  }

  async function handleAIScan(e: ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setScanState({ active: true, label: `Analizando ${files.length} archivo(s)` });
    try {
      const fd = new FormData();
      Array.from(files).forEach((file) => fd.append("images", file));
      const { data } = await api.post(`${getApiUrl()}/api/ai/scan-menu`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const aiCats: string[] = data?.data?.categories || [];
      const aiItems: any[] = data?.data?.items || [];
      const aiGlobalModifiers: any = data?.data?.global_modifiers || null;
      
      const categoryMap = new Map(categories.map((cat) => [cat.name.toLowerCase(), cat]));
      for (const catName of aiCats) {
        if (!categoryMap.has(catName.toLowerCase())) {
          const res = await api.post("/api/menu/categories", { name: catName });
          categoryMap.set(catName.toLowerCase(), res.data);
        }
      }
      const fallbackCat = categoryMap.values().next().value;
      for (const item of aiItems) {
        const cat = item.category ? categoryMap.get(item.category.toLowerCase()) : fallbackCat;
        if (!cat?.id) continue;
        
        const basePrice = item.base_options && item.base_options.length > 0 ? (item.base_options[0].price || 0) : 0;
        
        const { data: createdItem } = await api.post("/api/menu/items", {
          name: item.name,
          description: item.description || "",
          price: basePrice,
          categoryId: cat.id,
          isPopular: !!item.pantalla_principal
        });
        
        if (item.base_options && item.base_options.length > 0) {
          for (const v of item.base_options) {
            await api.post(`/api/menu/${createdItem.id}/variants`, {
              name: v.name, price: v.price || 0
            }).catch(e => console.error("Error variante IA", e));
          }
        }
        
        if (item.allowed_modifiers && item.allowed_modifiers.length > 0 && aiGlobalModifiers) {
          for (const modId of item.allowed_modifiers) {
            const globalModOptions = aiGlobalModifiers[modId];
            if (globalModOptions && globalModOptions.length > 0) {
              try {
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
      }
      toast.success("Menu importado");
      await fetchData();
    } catch (error) {
      console.error(error);
      setScanState({ active: true, label: "Error al analizar", error: "No se pudo importar el menu" });
    } finally {
      e.target.value = "";
      setTimeout(() => setScanState({ active: false, label: "" }), 1800);
    }
  }

  return (
    <div className="min-h-full bg-[#0a0a0c] p-4 sm:p-6 lg:p-10 text-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <BackButton ariaLabel="Volver al panel admin" />
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-400">Configuracion</span>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Catalogo de Menu</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-zinc-500">
                Productos, categorias, variantes, extras, modificadores, promos y favoritos desde la tablet.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-black uppercase tracking-[0.16em] text-amber-300">
              <Sparkles size={16} />
              IA menu
              <input type="file" multiple accept="image/*,.pdf" onChange={handleAIScan} className="hidden" />
            </label>
            <button onClick={() => openEditor()} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-amber-500 px-5 text-xs font-black uppercase tracking-[0.16em] text-[#0a0a0c] active:scale-95">
              <Plus size={18} strokeWidth={3} />
              Nuevo producto
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Productos" value={stats.total} />
          <Stat label="Activos" value={stats.active} tone="green" />
          <Stat label="Favoritos" value={stats.favorites} tone="amber" />
          <Stat label="Promos" value={stats.promos} tone="red" />
        </section>

        <div className="flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-[#121316] p-4 shadow-2xl">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-3 rounded-2xl bg-black/30 p-1">
              {[
                ["products", "Productos", Settings2],
                ["categories", "Categorias", Folder],
                ["variants", "Variantes", Layers],
              ].map(([id, label, Icon]) => {
                const active = section === id;
                const IconCmp = Icon as typeof Settings2;
                return (
                  <button key={id as string} onClick={() => setSection(id as Section)} className={`flex h-12 items-center justify-center gap-2 rounded-xl text-[10px] font-black uppercase tracking-[0.16em] ${active ? "bg-amber-500 text-[#0a0a0c]" : "text-zinc-500"}`}>
                    <IconCmp size={15} />
                    <span className="hidden sm:inline">{label as string}</span>
                  </button>
                );
              })}
            </div>
            {section === "products" && (
              <div className="flex flex-col gap-3 md:flex-row">
                <div className="relative md:w-80">
                  <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" size={16} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto..." className="h-12 w-full rounded-2xl border border-white/10 bg-[#0a0a0c] pl-11 pr-4 text-sm font-bold outline-none" />
                </div>
                <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none">
                  <option value="all">Todas las categorias</option>
                  {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {section === "products" && (
            <ProductsView
              loading={loading}
              items={filteredItems}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              openEditor={openEditor}
              deleteItem={deleteItem}
              patchItem={patchItem}
            />
          )}
          {section === "categories" && (
            <CategoriesView
              categories={categories}
              items={items}
              newCategoryName={newCategoryName}
              setNewCategoryName={setNewCategoryName}
              createCategory={createCategory}
              renameCategory={renameCategory}
              deleteCategory={deleteCategory}
            />
          )}
          {section === "variants" && (
            <VariantsView
              templates={templates}
              selectedTemplate={selectedTemplate}
              setSelectedTemplateId={setSelectedTemplateId}
              newTemplateName={newTemplateName}
              setNewTemplateName={setNewTemplateName}
              createTemplate={createTemplate}
              renameTemplate={renameTemplate}
              deleteTemplate={deleteTemplate}
              newOption={newOption}
              setNewOption={setNewOption}
              addTemplateOption={addTemplateOption}
              editTemplateOption={editTemplateOption}
              deleteTemplateOption={deleteTemplateOption}
            />
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 z-[120] flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-[#121316] p-3 shadow-2xl">
          <span className="px-3 text-xs font-black uppercase text-amber-300">{selectedIds.size} seleccionados</span>
          <button onClick={() => bulkPatch({ isAvailable: true })} className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-black text-emerald-400">Activar</button>
          <button onClick={() => bulkPatch({ isAvailable: false })} className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-400">Agotar</button>
          <select onChange={(e) => { bulkPatch({ categoryId: e.target.value }); e.target.value = ""; }} defaultValue="" className="rounded-xl border border-white/10 bg-[#0a0a0c] px-3 py-2 text-xs font-black">
            <option value="" disabled>Mover categoria</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <button onClick={bulkDelete} className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-black text-red-400">Eliminar</button>
          <button onClick={() => setSelectedIds(new Set())} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-zinc-400"><X size={16} /></button>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-[150] flex items-start justify-center overflow-y-auto bg-black/90 p-3 backdrop-blur-xl sm:p-6">
          <form onSubmit={saveProduct} className="my-4 flex w-full max-w-5xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-[#121316] shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-white/10 bg-black/25 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400">{editingItem ? "Editar producto" : "Nuevo producto"}</p>
                <h2 className="mt-1 text-2xl font-black">{form.name || "Producto sin nombre"}</h2>
              </div>
              <button type="button" onClick={() => setEditorOpen(false)} className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/5 text-zinc-400">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-4 border-b border-white/10 bg-black/20">
              {[
                ["basic", "General", Edit2],
                ["variants", "Variantes", Copy],
                ["extras", "Extras", Plus],
                ["modifiers", "Modificadores", Layers],
              ].map(([id, label, Icon]) => {
                const IconCmp = Icon as typeof Edit2;
                const active = editorTab === id;
                return (
                  <button key={id as string} type="button" onClick={() => setEditorTab(id as EditorTab)} className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[9px] font-black uppercase tracking-[0.12em] sm:flex-row sm:text-[10px] ${active ? "bg-white/5 text-amber-400" : "text-zinc-600"}`}>
                    <IconCmp size={15} />
                    {label as string}
                  </button>
                );
              })}
            </div>

            <div className="max-h-[65dvh] overflow-y-auto p-4 sm:p-6 lg:p-8">
              {editorTab === "basic" && (
                <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
                  <div className="space-y-3">
                    <div className="aspect-square overflow-hidden rounded-3xl border border-white/10 bg-[#0a0a0c]">
                      {imageFile || form.imageUrl ? (
                        <img src={imageFile ? URL.createObjectURL(imageFile) : form.imageUrl} alt="" className={`h-full w-full ${form.imageFit === "contain" ? "object-contain" : "object-cover"}`} />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 text-zinc-700">
                          <ImagePlus size={34} />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Sin foto</span>
                        </div>
                      )}
                    </div>
                    {(imageFile || form.imageUrl) && (
                      <div className="grid grid-cols-2 gap-2">
                        {([["cover", "Rellenar"], ["contain", "Ajustar"]] as const).map(([val, label]) => {
                          const active = form.imageFit === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setForm((prev) => ({ ...prev, imageFit: val }))}
                              className={`h-10 rounded-2xl border text-[11px] font-black uppercase tracking-[0.12em] transition-colors ${active ? "border-amber-500 bg-amber-500 text-black" : "border-white/10 bg-white/5 text-zinc-400"}`}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 text-xs font-black uppercase tracking-[0.14em] text-zinc-300">
                      <ImagePlus size={16} />
                      Subir foto
                      <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                    <input value={form.imageUrl} onChange={(e) => { setForm((prev) => ({ ...prev, imageUrl: e.target.value })); setImageFile(null); }} placeholder="o pega URL de imagen" className="w-full rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 py-3 text-sm outline-none" />
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field label="Nombre" className="sm:col-span-2">
                      <input autoFocus value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="input-admin text-lg font-black" required />
                    </Field>
                    <Field label="Precio base">
                      <input type="number" step="0.01" value={form.price} onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))} className="input-admin font-mono text-lg font-black" required />
                    </Field>
                    <Field label="Categoria">
                      <select value={form.categoryId} onChange={(e) => setForm((prev) => ({ ...prev, categoryId: e.target.value }))} className="input-admin" required>
                        <option value="">Elegir...</option>
                        {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Descripcion" className="sm:col-span-2">
                      <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} rows={3} className="input-admin resize-none" />
                    </Field>
                    <Switch label="Disponible" checked={form.isAvailable} onChange={(v) => setForm((prev) => ({ ...prev, isAvailable: v }))} />
                    <Switch label="Popular" checked={form.isPopular} onChange={(v) => setForm((prev) => ({ ...prev, isPopular: v }))} />
                    <Switch label="Favorito TPV" checked={form.isFavorite} onChange={(v) => setForm((prev) => ({ ...prev, isFavorite: v }))} />
                    <Switch label="Promocion por dia" checked={form.isPromo} onChange={(v) => setForm((prev) => ({ ...prev, isPromo: v }))} />
                    {form.isPromo && (
                      <div className="sm:col-span-2 flex flex-wrap gap-2">
                        {days.map(([key, label]) => {
                          const active = form.activeDays.includes(key);
                          return (
                            <button key={key} type="button" onClick={() => setForm((prev) => ({ ...prev, activeDays: active ? prev.activeDays.filter((day) => day !== key) : [...prev.activeDays, key] }))} className={`rounded-xl px-4 py-2 text-xs font-black ${active ? "bg-red-500 text-white" : "bg-white/5 text-zinc-500"}`}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {editorTab === "variants" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <PanelTitle title="Seleccion de variantes" desc="Activa para dejar elegir varios sabores en el TPV (ej. 1kg de boneless con 3 sabores)." />
                    <div className="mt-3">
                      <Switch label="Permitir elegir varias" checked={form.variantMultiSelect} onChange={(v) => setForm((prev) => ({ ...prev, variantMultiSelect: v }))} />
                    </div>
                    {form.variantMultiSelect && (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Minimo (0 = opcional)</span>
                          <input type="number" min={0} value={form.variantMinSelection} onChange={(e) => setForm((prev) => ({ ...prev, variantMinSelection: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">Maximo (0 = sin tope)</span>
                          <input type="number" min={0} value={form.variantMaxSelection} onChange={(e) => setForm((prev) => ({ ...prev, variantMaxSelection: Math.max(0, parseInt(e.target.value, 10) || 0) }))} className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none" />
                        </label>
                      </div>
                    )}
                  </div>
                  <PanelTitle title="Grupos reutilizables" desc="Selecciona sabores/tamanos que se sincronizan al guardar." />
                  <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2">
                    {templates.map((tpl) => {
                      const active = form.variantTemplateIds.includes(tpl.id);
                      return (
                        <button key={tpl.id} type="button" onClick={() => toggleTemplate(tpl.id)} className={`rounded-2xl border p-4 text-left ${active ? "border-amber-500 bg-amber-500 text-[#0a0a0c]" : "border-white/10 bg-white/5 text-white"}`}>
                          <div className="flex items-start justify-between gap-3">
                            <span className="font-black">{tpl.name}</span>
                            {active && <Check size={18} strokeWidth={4} />}
                          </div>
                          <p className={`mt-1 text-[10px] font-black uppercase tracking-[0.16em] ${active ? "text-[#0a0a0c]/60" : "text-zinc-500"}`}>{tpl.options.length} opciones</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <PanelTitle title="Variantes directas" desc="Opciones puntuales para este producto." />
                    <InlineAdder name={newVariant.name} price={newVariant.price} setValue={setNewVariant} onAdd={addVariant} disabled={!editingItem?.id} />
                    <ItemOptionList options={editingItem?.variants || []} onDelete={deleteVariant} />
                  </div>
                </div>
              )}

              {editorTab === "extras" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <PanelTitle title="Extras y toppings" desc="Adicionales con precio extra seleccionables al vender." />
                  <InlineAdder name={newComplement.name} price={newComplement.price} setValue={setNewComplement} onAdd={addComplement} disabled={!editingItem?.id} />
                  <ItemOptionList options={editingItem?.complements || []} onDelete={deleteComplement} />
                </div>
              )}

              {editorTab === "modifiers" && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <PanelTitle title="Modificadores avanzados" desc="Grupos obligatorios/opcionales, defaults y limites de seleccion." />
                  {editingItem?.id ? <ModifierGroupsEditor itemId={editingItem.id} /> : <p className="text-sm font-bold text-zinc-500">Guarda el producto primero para crear modificadores.</p>}
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 bg-black/30 p-4">
              <button type="button" onClick={() => setEditorOpen(false)} className="h-14 rounded-2xl border border-white/10 px-6 text-xs font-black uppercase tracking-[0.16em] text-zinc-400">Cerrar</button>
              <button type="submit" disabled={saving} className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-amber-500 text-xs font-black uppercase tracking-[0.16em] text-[#0a0a0c] disabled:opacity-50">
                {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                Guardar producto
              </button>
            </div>
          </form>
        </div>
      )}

      {scanState.active && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#121316] p-8 text-center">
            <Sparkles className={`mx-auto ${scanState.error ? "text-red-400" : "text-amber-400"}`} size={44} />
            <h3 className="mt-4 text-xl font-black">{scanState.error ? "No se pudo importar" : "Analizando menu"}</h3>
            <p className="mt-2 text-sm font-bold text-zinc-500">{scanState.error || scanState.label}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "zinc" }: { label: string; value: number; tone?: "zinc" | "green" | "amber" | "red" }) {
  const color = tone === "green" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : tone === "red" ? "text-red-400" : "text-white";
  return (
    <div className="rounded-2xl border border-white/10 bg-[#121316] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-600">{label}</p>
      <p className={`mt-2 text-3xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function ProductsView(props: {
  loading: boolean;
  items: MenuItem[];
  selectedIds: Set<string>;
  toggleSelect: (id: string) => void;
  openEditor: (item: MenuItem) => void;
  deleteItem: (item: MenuItem) => void;
  patchItem: (item: MenuItem, patch: Partial<MenuItem>) => void;
}) {
  if (props.loading) return <div className="py-16 text-center text-sm font-bold text-zinc-500">Cargando...</div>;
  if (props.items.length === 0) return <div className="py-16 text-center text-sm font-bold text-zinc-500">Sin productos</div>;
  return (
    <div className="grid gap-3">
      {props.items.map((item) => {
        const selected = props.selectedIds.has(item.id);
        return (
          <div key={item.id} className={`grid gap-3 rounded-2xl border p-4 md:grid-cols-[auto_1fr_auto] md:items-center ${selected ? "border-amber-500/50 bg-amber-500/5" : "border-white/10 bg-[#0a0a0c]"}`}>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={selected} onChange={() => props.toggleSelect(item.id)} className="h-5 w-5 accent-amber-500" />
              <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white/5">
                {item.imageUrl ? <img src={item.imageUrl} alt="" className={`h-full w-full ${item.imageFit === "contain" ? "object-contain" : "object-cover"}`} /> : <div className="flex h-full items-center justify-center text-xl">🍽</div>}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-base font-black">{item.name}</h3>
                {item.isFavorite && <Star size={14} className="text-amber-400" fill="currentColor" />}
                {item.isPromo && <span className="rounded-full bg-red-500/10 px-2 py-1 text-[9px] font-black uppercase text-red-400">Promo</span>}
              </div>
              <p className="mt-1 text-xs font-bold text-zinc-500">{item.category?.name || "Sin categoria"} · ${Number(item.price).toFixed(2)}</p>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-700">ID {item.id.slice(-6).toUpperCase()}</p>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button onClick={() => props.patchItem(item, { isAvailable: !item.isAvailable })} className={`inline-flex h-11 items-center gap-2 rounded-xl border px-3 text-[10px] font-black uppercase ${item.isAvailable ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400" : "border-red-500/20 bg-red-500/10 text-red-400"}`}>
                {item.isAvailable ? <Check size={13} /> : <XCircle size={13} />}
                {item.isAvailable ? "Activo" : "Agotado"}
              </button>
              <button onClick={() => props.patchItem(item, { isFavorite: !item.isFavorite })} className={`flex h-11 w-11 items-center justify-center rounded-xl border ${item.isFavorite ? "border-amber-500/40 bg-amber-500/20 text-amber-400" : "border-white/10 bg-white/5 text-zinc-600"}`}>
                <Star size={17} fill={item.isFavorite ? "currentColor" : "none"} />
              </button>
              <button onClick={() => props.openEditor(item)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-zinc-400">
                <Settings2 size={17} />
              </button>
              <button onClick={() => props.deleteItem(item)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 text-red-400">
                <Trash2 size={17} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoriesView(props: {
  categories: Category[];
  items: MenuItem[];
  newCategoryName: string;
  setNewCategoryName: (value: string) => void;
  createCategory: () => void;
  renameCategory: (category: Category) => void;
  deleteCategory: (category: Category) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input value={props.newCategoryName} onChange={(e) => props.setNewCategoryName(e.target.value)} placeholder="Nueva categoria" className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none" />
        <button onClick={props.createCategory} className="h-12 rounded-2xl bg-amber-500 px-5 text-xs font-black uppercase text-[#0a0a0c]">Crear categoria</button>
      </div>
      {props.categories.map((cat) => {
        const count = props.items.filter((item) => item.categoryId === cat.id).length;
        return (
          <div key={cat.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0a0a0c] p-4 sm:flex-row sm:items-center">
            <div className="flex-1">
              <h3 className="font-black">{cat.name}</h3>
              <p className="text-xs font-bold text-zinc-500">{count} producto(s)</p>
            </div>
            <button onClick={() => props.renameCategory(cat)} className="rounded-xl border border-white/10 px-4 py-2 text-xs font-black uppercase text-zinc-400">Editar</button>
            <button onClick={() => props.deleteCategory(cat)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-400">Eliminar</button>
          </div>
        );
      })}
    </div>
  );
}

function VariantsView(props: {
  templates: VariantTemplate[];
  selectedTemplate: VariantTemplate | null;
  setSelectedTemplateId: (id: string) => void;
  newTemplateName: string;
  setNewTemplateName: (value: string) => void;
  createTemplate: () => void;
  renameTemplate: (template: VariantTemplate) => void;
  deleteTemplate: (template: VariantTemplate) => void;
  newOption: { name: string; price: string };
  setNewOption: (value: { name: string; price: string }) => void;
  addTemplateOption: () => void;
  editTemplateOption: (option: VariantTemplateOption) => void;
  deleteTemplateOption: (option: VariantTemplateOption) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,0.9fr)_1.4fr]">
      <div className="space-y-3">
        <div className="grid gap-2">
          <input value={props.newTemplateName} onChange={(e) => props.setNewTemplateName(e.target.value)} placeholder="Nuevo grupo: tamanos, sabores..." className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none" />
          <button onClick={props.createTemplate} className="h-12 rounded-2xl bg-amber-500 px-5 text-xs font-black uppercase text-[#0a0a0c]">Crear grupo</button>
        </div>
        {props.templates.map((tpl) => (
          <button key={tpl.id} onClick={() => props.setSelectedTemplateId(tpl.id)} className={`w-full rounded-2xl border p-4 text-left ${props.selectedTemplate?.id === tpl.id ? "border-amber-500 bg-amber-500/10" : "border-white/10 bg-[#0a0a0c]"}`}>
            <p className="font-black">{tpl.name}</p>
            <p className="text-xs font-bold text-zinc-500">{tpl.options.length} opciones</p>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-[#0a0a0c] p-4">
        {props.selectedTemplate ? (
          <>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-black">{props.selectedTemplate.name}</h3>
                <p className="text-xs font-bold text-zinc-500">Opciones reutilizables</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => props.renameTemplate(props.selectedTemplate!)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-400">Editar</button>
                <button onClick={() => props.deleteTemplate(props.selectedTemplate!)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black uppercase text-red-400">Eliminar</button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px_auto]">
              <input value={props.newOption.name} onChange={(e) => props.setNewOption({ ...props.newOption, name: e.target.value })} placeholder="Opcion" className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold outline-none" />
              <input value={props.newOption.price} onChange={(e) => props.setNewOption({ ...props.newOption, price: e.target.value })} type="number" placeholder="$0" className="h-12 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-bold outline-none" />
              <button onClick={props.addTemplateOption} className="h-12 rounded-2xl bg-amber-500 px-5 text-xs font-black uppercase text-[#0a0a0c]">Agregar</button>
            </div>
            <div className="mt-4 space-y-2">
              {props.selectedTemplate.options.map((opt) => (
                <div key={opt.id} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3">
                  <div className="flex-1">
                    <p className="font-black">{opt.name}</p>
                    <p className="text-xs font-bold text-amber-400">{opt.price > 0 ? `+$${opt.price}` : "Gratis"}</p>
                  </div>
                  <button onClick={() => props.editTemplateOption(opt)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black uppercase text-zinc-400">Editar</button>
                  <button onClick={() => props.deleteTemplateOption(opt)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-black uppercase text-red-400">Eliminar</button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="py-16 text-center text-sm font-bold text-zinc-500">Crea o selecciona un grupo</div>
        )}
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex h-14 items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 text-left">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-zinc-300">{label}</span>
      <span className={`relative h-7 w-12 rounded-full ${checked ? "bg-amber-500" : "bg-white/10"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

function PanelTitle({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-lg font-black">{title}</h3>
      <p className="text-xs font-bold text-zinc-500">{desc}</p>
    </div>
  );
}

function InlineAdder({ name, price, setValue, onAdd, disabled }: {
  name: string;
  price: string;
  setValue: (value: { name: string; price: string }) => void;
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_110px_auto]">
      <input value={name} onChange={(e) => setValue({ name: e.target.value, price })} placeholder={disabled ? "Guarda primero" : "Nombre"} disabled={disabled} className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none disabled:opacity-40" />
      <input value={price} onChange={(e) => setValue({ name, price: e.target.value })} type="number" placeholder="$0" disabled={disabled} className="h-12 rounded-2xl border border-white/10 bg-[#0a0a0c] px-4 text-sm font-bold outline-none disabled:opacity-40" />
      <button type="button" onClick={onAdd} disabled={disabled || !name.trim()} className="h-12 rounded-2xl bg-amber-500 px-5 text-xs font-black uppercase text-[#0a0a0c] disabled:opacity-40">Agregar</button>
    </div>
  );
}

function ItemOptionList({ options, onDelete }: { options: Array<{ id: string; name: string; price: number }>; onDelete: (id: string) => void }) {
  if (options.length === 0) return <p className="rounded-2xl border border-dashed border-white/10 py-8 text-center text-xs font-black uppercase tracking-[0.16em] text-zinc-600">Sin opciones</p>;
  return (
    <div className="space-y-2">
      {options.map((option) => (
        <div key={option.id} className="flex items-center gap-3 rounded-2xl bg-[#0a0a0c] p-3">
          <span className="flex-1 text-sm font-black">{option.name}</span>
          <span className="font-mono text-xs font-black text-amber-400">{option.price > 0 ? `+$${Number(option.price).toFixed(2)}` : "Gratis"}</span>
          <button type="button" onClick={() => onDelete(option.id)} className="flex h-9 w-9 items-center justify-center rounded-xl text-red-400"><Trash2 size={15} /></button>
        </div>
      ))}
    </div>
  );
}
