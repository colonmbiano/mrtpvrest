"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/api";

const DAYS = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
];

const LINK_TYPES = [
  { value: "NONE",     label: "Sin enlace" },
  { value: "CATEGORY", label: "Ir a categoría" },
  { value: "ITEM",     label: "Ir a producto" },
  { value: "URL",      label: "URL externa" },
];

const emptyForm = {
  title: "", description: "", imageUrl: "",
  linkType: "NONE", linkValue: "", isActive: false,
  scheduleDays: [] as number[],
  scheduleStart: "", scheduleEnd: "",
  dateFrom: "", dateTo: "",
};

export default function BannersPage() {
  const [banners, setBanners] = useState<any[]>([]);
  const [cats, setCats]       = useState<any[]>([]);
  const [items, setItems]     = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editBanner, setEditBanner] = useState<any>(null);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<typeof emptyForm>({...emptyForm});

  async function fetchData() {
    const [b, c, i] = await Promise.all([
      api.get("/api/banners/all"),
      api.get("/api/menu/categories"),
      api.get("/api/menu/items"),
    ]);
    setBanners(b.data);
    setCats(c.data);
    setItems(i.data);
  }

  useEffect(() => { fetchData(); }, []);

  function openForm(banner?: any) {
    setEditBanner(banner || null);
    if (banner) {
      let days: number[] = [];
      try { days = JSON.parse(banner.scheduleDays || "[]"); } catch {}
      setForm({
        title: banner.title || "",
        description: banner.description || "",
        imageUrl: banner.imageUrl || "",
        linkType: banner.linkType || "NONE",
        linkValue: banner.linkValue || "",
        isActive: banner.isActive,
        scheduleDays: days,
        scheduleStart: banner.scheduleStart || "",
        scheduleEnd: banner.scheduleEnd || "",
        dateFrom: banner.dateFrom ? banner.dateFrom.slice(0,10) : "",
        dateTo: banner.dateTo ? banner.dateTo.slice(0,10) : "",
      });
    } else {
      setForm({...emptyForm, scheduleDays: []});
    }
    setShowForm(true);
  }

  async function uploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const { data } = await api.post("/api/upload/image", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setForm(p => ({ ...p, imageUrl: data.url }));
    } catch { alert("Error al subir imagen"); }
    finally { setUploading(false); }
  }

  function toggleDay(day: number) {
    setForm(p => ({
      ...p,
      scheduleDays: p.scheduleDays.includes(day)
        ? p.scheduleDays.filter(d => d !== day)
        : [...p.scheduleDays, day].sort()
    }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.imageUrl) { alert("Agrega una imagen"); return; }
    if (form.scheduleDays.length === 0 && !form.dateFrom) {
      alert("Selecciona al menos un día o un rango de fechas para programar el banner");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        scheduleDays: JSON.stringify(form.scheduleDays),
        dateFrom: form.dateFrom ? new Date(form.dateFrom + "T00:00:00").toISOString() : null,
        dateTo: form.dateTo ? new Date(form.dateTo + "T23:59:59").toISOString() : null,
      };
      if (editBanner) {
        await api.put(`/api/banners/${editBanner.id}`, payload);
      } else {
        await api.post("/api/banners", payload);
      }
      setShowForm(false);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  }

  async function toggleActive(banner: any) {
    await api.put(`/api/banners/${banner.id}`, { isActive: !banner.isActive });
    fetchData();
  }

  async function deleteBanner(id: string) {
    if (!confirm("¿Eliminar este banner?")) return;
    await api.delete(`/api/banners/${id}`);
    fetchData();
  }

  function scheduleLabel(banner: any) {
    const parts: string[] = [];
    try {
      const days: number[] = JSON.parse(banner.scheduleDays || "[]");
      if (days.length > 0) parts.push(days.map(d => DAYS[d].label).join(", "));
    } catch {}
    if (banner.scheduleStart && banner.scheduleEnd)
      parts.push(`${banner.scheduleStart} - ${banner.scheduleEnd}`);
    if (banner.dateFrom || banner.dateTo) {
      const from = banner.dateFrom ? new Date(banner.dateFrom).toLocaleDateString("es-MX") : "...";
      const to   = banner.dateTo   ? new Date(banner.dateTo).toLocaleDateString("es-MX")   : "...";
      parts.push(`${from} → ${to}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Sin programación";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Banners</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Se muestran automáticamente según su programación</p>
        </div>
        <button onClick={() => openForm()}
          className="px-4 py-2 rounded-xl text-sm font-syne font-black"
          style={{background:"var(--gold)",color:"#000"}}>
          + Nuevo banner
        </button>
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-lg rounded-2xl border my-4" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor:"var(--border)"}}>
              <h2 className="font-syne font-black text-xl">{editBanner ? "Editar banner" : "Nuevo banner"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{background:"var(--surf2)",color:"var(--muted)"}}>✕</button>
            </div>

            <form onSubmit={save} className="p-6 flex flex-col gap-5">

              {/* Imagen */}
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Imagen</label>
                {form.imageUrl && (
                  <img src={form.imageUrl} alt="preview" className="w-full h-36 object-cover rounded-xl mb-2" />
                )}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full py-2.5 rounded-xl text-sm font-bold border mb-2"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                  {uploading ? "Subiendo..." : "📷 Subir imagen"}
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadImage} />
                <input value={form.imageUrl} onChange={e => setForm(p=>({...p,imageUrl:e.target.value}))}
                  placeholder="o pega URL de imagen"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
              </div>

              {/* Titulo y descripcion */}
              {[
                { label:"Título", field:"title", placeholder:"Ej: Jueves de Burritos $100" },
                { label:"Descripción", field:"description", placeholder:"Ej: Solo en burritos campechanos" },
              ].map(f => (
                <div key={f.field}>
                  <label className="block text-xs font-bold mb-1 uppercase tracking-wider" style={{color:"var(--muted)"}}>{f.label}</label>
                  <input value={(form as any)[f.field]} onChange={e => setForm(p=>({...p,[f.field]:e.target.value}))}
                    placeholder={f.placeholder}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                </div>
              ))}

              {/* Enlace */}
              <div>
                <label className="block text-xs font-bold mb-2 uppercase tracking-wider" style={{color:"var(--muted)"}}>Enlace al tocar</label>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {LINK_TYPES.map(t => (
                    <button key={t.value} type="button" onClick={() => setForm(p=>({...p,linkType:t.value,linkValue:""}))}
                      className="py-2 rounded-xl text-xs font-bold"
                      style={{
                        background: form.linkType===t.value ? "rgba(245,166,35,0.15)" : "var(--surf2)",
                        color: form.linkType===t.value ? "var(--gold)" : "var(--muted)",
                        border: `1px solid ${form.linkType===t.value ? "var(--gold)" : "var(--border)"}`
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {form.linkType === "CATEGORY" && (
                  <select value={form.linkValue} onChange={e => setForm(p=>({...p,linkValue:e.target.value}))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}>
                    <option value="">Selecciona categoría</option>
                    {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                {form.linkType === "ITEM" && (
                  <select value={form.linkValue} onChange={e => setForm(p=>({...p,linkValue:e.target.value}))}
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}}>
                    <option value="">Selecciona producto</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                )}
                {form.linkType === "URL" && (
                  <input value={form.linkValue} onChange={e => setForm(p=>({...p,linkValue:e.target.value}))}
                    placeholder="https://..."
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
                )}
              </div>

              {/* ── PROGRAMACION ───────────────────────────────── */}
              <div className="rounded-2xl p-4 border" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
                <div className="text-xs font-black uppercase tracking-wider mb-4" style={{color:"var(--gold)"}}>
                  📅 Programación
                </div>

                {/* Dias de la semana */}
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Días de la semana</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {DAYS.map(d => (
                      <button key={d.value} type="button" onClick={() => toggleDay(d.value)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={{
                          background: form.scheduleDays.includes(d.value) ? "var(--gold)" : "var(--surf)",
                          color: form.scheduleDays.includes(d.value) ? "#000" : "var(--muted)",
                          border: `1px solid ${form.scheduleDays.includes(d.value) ? "var(--gold)" : "var(--border)"}`
                        }}>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button type="button" onClick={() => setForm(p=>({...p,scheduleDays:[0,1,2,3,4,5,6]}))}
                      className="text-xs px-2 py-1 rounded-lg" style={{color:"var(--gold)"}}>
                      Todos los días
                    </button>
                    <button type="button" onClick={() => setForm(p=>({...p,scheduleDays:[1,2,3,4,5]}))}
                      className="text-xs px-2 py-1 rounded-lg" style={{color:"var(--muted)"}}>
                      Lun-Vie
                    </button>
                    <button type="button" onClick={() => setForm(p=>({...p,scheduleDays:[5,6]}))}
                      className="text-xs px-2 py-1 rounded-lg" style={{color:"var(--muted)"}}>
                      Fin de semana
                    </button>
                  </div>
                </div>

                {/* Horario */}
                <div className="mb-4">
                  <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Horario (opcional)</label>
                  <div className="flex gap-2 items-center">
                    <input type="time" value={form.scheduleStart}
                      onChange={e => setForm(p=>({...p,scheduleStart:e.target.value}))}
                      className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    <span style={{color:"var(--muted)"}}>—</span>
                    <input type="time" value={form.scheduleEnd}
                      onChange={e => setForm(p=>({...p,scheduleEnd:e.target.value}))}
                      className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
                      style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                  </div>
                </div>

                {/* Rango de fechas */}
                <div>
                  <label className="block text-xs font-bold mb-2" style={{color:"var(--muted)"}}>Rango de fechas (opcional)</label>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Desde</div>
                      <input type="date" value={form.dateFrom}
                        onChange={e => setForm(p=>({...p,dateFrom:e.target.value}))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                    <span className="mt-4" style={{color:"var(--muted)"}}>→</span>
                    <div className="flex-1">
                      <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Hasta (expiración)</div>
                      <input type="date" value={form.dateTo}
                        onChange={e => setForm(p=>({...p,dateTo:e.target.value}))}
                        className="w-full px-3 py-2 rounded-xl text-sm outline-none"
                        style={{background:"var(--surf)",border:"1px solid var(--border)",color:"var(--text)"}} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Activo */}
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isActive}
                  onChange={e => setForm(p=>({...p,isActive:e.target.checked}))} />
                <span>Banner activo</span>
                <span className="text-xs" style={{color:"var(--muted)"}}>
                  (se mostrará solo en los días/horas programados)
                </span>
              </label>

              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-3 rounded-xl font-bold text-sm border"
                  style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 rounded-xl font-syne font-black text-sm"
                  style={{background: saving ? "var(--muted)" : "var(--gold)",color:"#000"}}>
                  {saving ? "Guardando..." : "Guardar banner"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="flex flex-col gap-4">
        {banners.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{background:"var(--surf)",borderColor:"var(--border)",color:"var(--muted)"}}>
            No hay banners aún
          </div>
        ) : banners.map(banner => (
          <div key={banner.id} className="rounded-2xl border overflow-hidden"
            style={{background:"var(--surf)",borderColor:"var(--border)",opacity: banner.isActive ? 1 : 0.5}}>
            <div className="flex">
              <div className="w-44 h-28 flex-shrink-0 bg-gray-800">
                <img src={banner.imageUrl} alt={banner.title} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 p-4 flex flex-col justify-between">
                <div>
                  <div className="font-syne font-bold">{banner.title || "Sin título"}</div>
                  {banner.description && (
                    <div className="text-xs mt-0.5" style={{color:"var(--muted)"}}>{banner.description}</div>
                  )}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                      style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)"}}>
                      📅 {scheduleLabel(banner)}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => toggleActive(banner)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{
                      background: banner.isActive ? "rgba(34,197,94,0.1)" : "rgba(107,114,128,0.1)",
                      color: banner.isActive ? "#22c55e" : "var(--muted)",
                      border: `1px solid ${banner.isActive ? "rgba(34,197,94,0.2)" : "var(--border)"}`
                    }}>
                    {banner.isActive ? "✓ Activo" : "Inactivo"}
                  </button>
                  <button onClick={() => openForm(banner)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border"
                    style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                    Editar
                  </button>
                  <button onClick={() => deleteBanner(banner.id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold"
                    style={{background:"rgba(239,68,68,0.1)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.2)"}}>
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
