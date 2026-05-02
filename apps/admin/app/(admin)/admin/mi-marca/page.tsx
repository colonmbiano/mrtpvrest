"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Image from "next/image";

type Location = { id: string; name: string; slug: string; address?: string; phone?: string; autoPromoEnabled?: boolean; autoPromoThreshold?: number; autoPromoDiscount?: number; };

function slugify(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function LocationsSection() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Location | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 15 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchLocations = () => {
    setLoading(true);
    api.get("/api/admin/locations")
      .then(r => setLocations(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLocations(); }, []);

  const openCreate = () => { setEditing(null); setForm({ name: "", address: "", phone: "", autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 15 }); setError(""); setShowModal(true); };
  const openEdit = (loc: Location) => { setEditing(loc); setForm({ name: loc.name, address: loc.address || "", phone: loc.phone || "", autoPromoEnabled: loc.autoPromoEnabled || false, autoPromoThreshold: loc.autoPromoThreshold || 10, autoPromoDiscount: loc.autoPromoDiscount || 15 }); setError(""); setShowModal(true); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("El nombre es requerido"); return; }
    setSaving(true); setError("");
    try {
      if (editing) {
        await api.put(`/api/admin/locations/${editing.id}`, form);
      } else {
        await api.post("/api/admin/locations", { ...form, slug: slugify(form.name) });
      }
      setShowModal(false);
      fetchLocations();
      if (!editing) window.location.reload();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error al guardar");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`¿Eliminar sucursal "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api.delete(`/api/admin/locations/${id}`);
      fetchLocations();
      window.location.reload();
    } catch (err: any) {
      alert(err?.response?.data?.error || "Error al eliminar");
    }
  };

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter">Mis Sucursales</h2>
          <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.2em]">Administra tus puntos de venta</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-2xl transition-all active:scale-95 shadow-lg shadow-orange-500/20"
        >
          + Nueva Sucursal
        </button>
      </div>

      {loading ? (
        <div className="text-gray-500 text-xs uppercase tracking-widest">Cargando...</div>
      ) : locations.length === 0 ? (
        <div className="bg-[#111] border border-dashed border-gray-700 rounded-[2rem] p-10 text-center">
          <p className="text-gray-500 text-sm font-bold">Sin sucursales registradas</p>
          <p className="text-gray-700 text-xs mt-1">Crea tu primera sucursal para comenzar a operar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {locations.map(loc => (
            <div key={loc.id} className="bg-[#111] border border-gray-800 rounded-[2rem] p-6 flex flex-col gap-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-black text-white text-base">{loc.name}</p>
                  <p className="text-[10px] text-gray-600 font-mono mt-0.5">/{loc.slug}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => openEdit(loc)} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-orange-400 transition-colors px-3 py-1.5 rounded-xl border border-gray-700 hover:border-orange-500/40">Editar</button>
                  <button onClick={() => handleDelete(loc.id, loc.name)} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-red-400 transition-colors px-3 py-1.5 rounded-xl border border-gray-700 hover:border-red-500/40">Eliminar</button>
                </div>
              </div>
              {loc.address && <p className="text-xs text-gray-500">{loc.address}</p>}
              {loc.phone && <p className="text-xs text-gray-600">{loc.phone}</p>}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 w-full max-w-md mx-4 shadow-2xl">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-6">
              {editing ? "Editar Sucursal" : "Nueva Sucursal"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Nombre *</label>
                <input
                  autoFocus
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej. Sucursal Centro"
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all font-bold text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Dirección</label>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setForm({ ...form, address: e.target.value })}
                  placeholder="Ej. Av. Reforma 123"
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Teléfono</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="Ej. 55 1234 5678"
                  className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold"
                />
              </div>

              <div className="bg-black/50 p-5 rounded-3xl border border-orange-500/20">
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input
                    type="checkbox"
                    checked={form.autoPromoEnabled}
                    onChange={e => setForm({ ...form, autoPromoEnabled: e.target.checked })}
                    className="w-5 h-5 accent-orange-500 rounded"
                  />
                  <span className="text-sm font-black text-white uppercase tracking-widest">Promociones con IA</span>
                </label>
                {form.autoPromoEnabled && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Umbral (ventas min)</label>
                      <input
                        type="number"
                        min="1"
                        value={form.autoPromoThreshold}
                        onChange={e => setForm({ ...form, autoPromoThreshold: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Descuento (%)</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={form.autoPromoDiscount}
                        onChange={e => setForm({ ...form, autoPromoDiscount: parseInt(e.target.value) || 0 })}
                        className="w-full bg-black border border-white/10 rounded-2xl px-4 py-3 outline-none focus:border-orange-500 transition-all text-sm font-bold"
                      />
                    </div>
                  </div>
                )}
              </div>

              {error && <p className="text-red-400 text-xs font-bold ml-2">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest border border-gray-700 text-gray-400 hover:border-gray-500 transition-all">
                  Cancelar
                </button>
                <button type="submit" disabled={saving} className="flex-1 bg-orange-500 hover:bg-orange-600 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-white shadow-xl shadow-orange-500/20 disabled:opacity-50 transition-all">
                  {saving ? "Guardando..." : editing ? "Actualizar" : "Crear Sucursal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BrandConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [config, setConfig] = useState({
    name: "",
    logoUrl: "",
    phone: "",
    address: "",
    whatsappNumber: "",
    deliveryFee: 0,
    estimatedDelivery: 40,
    storefrontTheme: "KAWAII"
  });

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        setConfig(prev => ({ ...prev, ...res.data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string; // "data:image/png;base64,..."
      setConfig(prev => ({ ...prev, logoUrl: base64 }));
      setUploading(false);
    };
    reader.onerror = () => {
      alert("Error al leer la imagen");
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  async function handleSave() {
    setSaving(true);
    try {
      const current = config;
      // Log para diagnóstico — confirma que la función ejecuta y la URL destino
      console.log("[mi-marca] handleSave START — API_URL:", process.env.NEXT_PUBLIC_API_URL);
      await api.put("/api/admin/brand", { name: current.name, logoUrl: current.logoUrl });
      console.log("[mi-marca] brand OK");
      const { logoUrl: _logo, ...configWithoutLogo } = current;
      await api.put("/api/admin/config", configWithoutLogo);
      console.log("[mi-marca] config OK — reloading");
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
      console.error("[mi-marca] handleSave FAIL", { status, msg, err });
      alert(`Error al guardar (${status ?? "sin respuesta"}): ${msg}`);
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="p-8 text-white font-syne flex flex-col items-center justify-center min-h-[50vh]">
      <div className="w-10 h-10 border-t-2 border-orange-500 rounded-full animate-spin mb-4"></div>
      <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-8 font-syne text-white">
      <div className="mb-12">
        <h1 className="text-5xl font-black mb-2 uppercase tracking-tighter">Mi Marca</h1>
        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.2em]">Personaliza tu identidad visual</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Columna Izquierda: Logo */}
        <div className="md:col-span-1">
          <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 text-center flex flex-col items-center">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-6">Logo Oficial</p>
            <div className="relative group mb-6">
              <div className="w-32 h-32 bg-black border border-white/10 rounded-3xl flex items-center justify-center overflow-hidden shadow-2xl transition-all group-hover:border-orange-500/50">
                {config.logoUrl ? (
                  <img src={config.logoUrl} className="w-full h-full object-contain" alt="Logo" />
                ) : (
                  <span className="text-4xl opacity-20">🍔</span>
                )}
                {uploading && <div className="absolute inset-0 bg-black/80 flex items-center justify-center animate-pulse text-[10px] font-black uppercase text-orange-500">Subiendo...</div>}
              </div>
              <label className="absolute -bottom-2 -right-2 bg-orange-500 text-white w-10 h-10 rounded-2xl flex items-center justify-center cursor-pointer shadow-xl hover:scale-110 transition-all border-4 border-black">
                <span>📷</span>
                <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
            <p className="text-[9px] text-gray-600 mt-2 italic text-center leading-relaxed">
              Haz clic en la cámara para subir un logo PNG o JPG.
            </p>
          </div>
        </div>

        {/* Columna Derecha: Datos */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 space-y-6">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Nombre del Restaurante</label>
              <input type="text" value={config.name} onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, name: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all font-black text-lg" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Teléfono</label>
                <input type="text" value={config.phone} onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, phone: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">WhatsApp</label>
                <input type="text" value={config.whatsappNumber} onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, whatsappNumber: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Dirección Principal</label>
              <input type="text" value={config.address} onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, address: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-3 block tracking-widest">Estilo de Tienda Online</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { id: "KAWAII", name: "Kawaii", emoji: "🌸", desc: "Soft / Pastel / Editorial" },
                  { id: "HALO", name: "Halo", emoji: "🛰", desc: "Sci-Fi / HUD táctico" },
                  { id: "BRUTALIST", name: "Brutalist", emoji: "⚡", desc: "Street / Alto contraste" }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setConfig(p => ({ ...p, storefrontTheme: t.id }))}
                    className={`p-4 rounded-3xl border-2 transition-all text-left group ${
                      config.storefrontTheme === t.id 
                        ? "border-orange-500 bg-orange-500/10" 
                        : "border-white/5 bg-black hover:border-white/20"
                    }`}
                  >
                    <span className="text-2xl mb-2 block">{t.emoji}</span>
                    <p className="font-black text-sm uppercase tracking-tight">{t.name}</p>
                    <p className="text-[10px] text-gray-500 font-bold group-hover:text-gray-400">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading}
            className="w-full bg-orange-500 hover:bg-orange-600 py-5 rounded-[2rem] font-black text-white shadow-2xl shadow-orange-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Actualizar Identidad"}
          </button>
        </div>
      </div>

      <LocationsSection />
    </div>
  );
}
