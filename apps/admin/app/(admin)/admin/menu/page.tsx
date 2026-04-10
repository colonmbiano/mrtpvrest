"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import api from "@/lib/api";

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
  const [form, setForm] = useState({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", isPromo:false, activeDays:[] as string[], variantTemplateIds:[] as string[] });
  const [imageFile, setImageFile] = useState<File|null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [filterCat, setFilterCat] = useState("all");
  const [search, setSearch] = useState("");

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
    setScanState({ active: true, currentFile: fileNames[0], current: 1, total: files.length, error: null });

    // Cicla entre los nombres de archivo mientras espera la respuesta de la IA
    let fileIdx = 0;
    const cycleInterval = setInterval(() => {
      fileIdx = (fileIdx + 1) % fileNames.length;
      setScanState(p => (!p.error ? { ...p, currentFile: fileNames[fileIdx], current: fileIdx + 1 } : p));
    }, 1200);

    try {
      const fd = new FormData();
      for (let i = 0; i < files.length; i++) fd.append("images", files[i]);

      const { data } = await api.post("/api/ai/scan-menu", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });

      clearInterval(cycleInterval);
      const { categories: aiCats, items: aiItems } = data.data;

      // Fase 2: importar categorías
      setScanState(p => ({ ...p, currentFile: 'Creando categorías...', current: 0, total: aiItems?.length || 0 }));
      let currentCats = [...cats];
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
          try {
            await api.post("/api/menu/items", {
              name: item.name, description: item.description,
              price: item.price || 0, categoryId: category?.id || currentCats[0]?.id, isPopular: false
            });
          } catch (err) { console.error("Error creando item IA", err); }
        }
      }

      fetchData();
      setScanState({ active: false, currentFile: '', current: 0, total: 0, error: null });
    } catch (error: any) {
      clearInterval(cycleInterval);
      setScanState(p => ({ ...p, error: error.response?.data?.error || error.message || "Error al procesar con IA" }));
    } finally {
      e.target.value = "";
    }
  }

  function openForm(item?: any) {
    if (item) {
      setEditItem(item);
      setForm({ name:item.name, description:item.description||"", price:String(item.price), categoryId:item.categoryId, isPopular:item.isPopular, imageUrl:item.imageUrl||"", isPromo:item.isPromo||false, activeDays:item.activeDays||[], variantTemplateIds:[] });
      setImagePreview(item.imageUrl||"");
      api.get(`/api/menu/items/${item.id}`).then(r => {
        setComplements(r.data.complements || []);
        setVariants(r.data.variants || []);
        const tplIds = (r.data.variantTemplates || r.data.appliedTemplates || []).map((t: any) => t.id ?? t.variantTemplateId).filter(Boolean);
        setForm(p => ({ ...p, variantTemplateIds: tplIds }));
      }).catch(() => { setComplements([]); setVariants([]); });
    } else {
      setEditItem(null);
      setForm({ name:"", description:"", price:"", categoryId:"", isPopular:false, imageUrl:"", isPromo:false, activeDays:[], variantTemplateIds:[] });
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
      const fd = new FormData();
      fd.append("image", imageFile);
      const { data } = await api.post("/api/upload/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      return data.url;
    } finally { setUploading(false); }
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
      alert(err.response?.data?.error || "Error al guardar");
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

  const filtered = items.filter(i =>
    (filterCat === "all" || i.categoryId === filterCat) &&
    (search === "" || (i.name || "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Menú</h1>
          <p className="text-xs text-gray-500 uppercase font-bold tracking-widest mt-1">Gestión de artículos y categorías</p>
        </div>
        <div className="flex gap-3">
          {/* BOTÓN IA ESCANEO */}
          <label className={`px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 transition-all active:scale-95 shadow-lg ${scanState.active ? 'bg-orange-200 text-black cursor-not-allowed' : 'bg-orange-500 text-white shadow-orange-500/20 cursor-pointer'}`}>
            🤖 Escaneo Inteligente (IA)
            {!scanState.active && <input type="file" accept="image/*" multiple onChange={handleAIScan} className="hidden" />}
          </label>

          <button onClick={() => openForm()}
            className="px-4 py-2 rounded-xl text-sm font-syne font-black bg-white text-black hover:bg-gray-200 transition-all"
          >
            + Nuevo platillo
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-4 flex-wrap items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar platillo..."
          className="px-4 py-2 rounded-xl text-sm outline-none flex-1 min-w-48"
          style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-4 py-2 rounded-xl text-sm outline-none"
          style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}}>
          <option value="all">Todas las categorías</option>
          {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <span className="text-xs font-bold" style={{color:"var(--muted)"}}>{filtered.length} artículos</span>
      </div>

      {/* Lista estilo Loyverse */}
      {loading ? <div className="text-center py-20">Cargando...</div> : (
        <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
          <div className="grid grid-cols-12 gap-3 px-4 py-3 text-xs font-black uppercase tracking-wider border-b"
            style={{background:"var(--surf2)",borderColor:"var(--border)",color:"var(--muted)"}}>
            <span className="col-span-1"></span>
            <span className="col-span-4">Nombre del artículo</span>
            <span className="col-span-2">Categoría</span>
            <span className="col-span-1 text-right">Precio</span>
            <span className="col-span-2 text-center">Estado</span>
            <span className="col-span-2 text-right">Acciones</span>
          </div>

          {filtered.map((item, idx) => (
            <div key={item.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center border-b transition-all" style={{borderColor:"var(--border)", background: idx % 2 === 0 ? "var(--surf)" : "transparent", opacity: item.isAvailable ? 1 : 0.5}}>
              <div className="col-span-1">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center" style={{background:"var(--surf2)"}}>
                  {item.imageUrl ? <Image src={item.imageUrl} alt={item.name} width={40} height={40} className="object-cover w-full h-full" /> : <span className="text-lg">🍔</span>}
                </div>
              </div>
              <div className="col-span-4 font-syne font-bold text-sm">{item.name}</div>
              <div className="col-span-2 text-xs font-medium text-[var(--muted)]">{item.category?.name || "—"}</div>
              <div className="col-span-1 text-right font-syne font-black text-sm text-[var(--gold)]">${item.price}</div>
              <div className="col-span-2 flex justify-center">
                <button onClick={() => toggleAvailable(item)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all border ${item.isAvailable ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`}>
                  {item.isAvailable ? "● Activo" : "● Inactivo"}
                </button>
              </div>
              <div className="col-span-2 flex gap-2 justify-end">
                <button onClick={() => openForm(item)} className="px-3 py-1.5 rounded-lg text-xs font-bold border" style={{borderColor:"var(--border)",color:"var(--muted)"}}>✏️ Editar</button>
                <button onClick={() => deleteItem(item)} className="px-2 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-500 border border-red-500/20">🗑️</button>
              </div>
            </div>
          ))}
        </div>
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
                  <div className="relative w-full h-40 rounded-xl overflow-hidden mb-2">
                    <Image src={imagePreview} alt="preview" fill className="object-cover" />
                  </div>
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
                  <select value={form.categoryId} onChange={e => setForm(p=>({...p,categoryId:e.target.value}))} required className="w-full px-4 py-2.5 rounded-xl text-sm" style={{background:"var(--surf2)",border:"1.5px solid var(--border)",color:"var(--text)"}}>
                    <option value="">Seleccionar...</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
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
    </div>
  );
}
