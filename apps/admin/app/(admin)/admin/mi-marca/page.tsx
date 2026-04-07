"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import Image from "next/image";

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
  });

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        setConfig(prev => ({ ...prev, ...res.data }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("image", file);

    try {
      const { data } = await api.post("/api/upload/image", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setConfig({ ...config, logoUrl: data.url });
    } catch (error) {
      alert("Error al subir el logo");
    } finally {
      setUploading(false);
    }
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      // 1. Guardar Marca (Nombre y Logo)
      await api.put("/api/admin/brand", { name: config.name, logoUrl: config.logoUrl });
      // 2. Guardar Config Operativa
      await api.put("/api/admin/config", config);
      alert("¡Identidad de marca actualizada!");
    } catch {
      alert("Error al guardar");
    } finally {
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

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-8">
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
              <input type="text" value={config.name} onChange={(e) => setConfig({...config, name: e.target.value})} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all font-black text-lg" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Teléfono</label>
                <input type="text" value={config.phone} onChange={(e) => setConfig({...config, phone: e.target.value})} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">WhatsApp</label>
                <input type="text" value={config.whatsappNumber} onChange={(e) => setConfig({...config, whatsappNumber: e.target.value})} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Dirección Principal</label>
              <input type="text" value={config.address} onChange={(e) => setConfig({...config, address: e.target.value})} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
          </div>

          <button
            disabled={saving || uploading}
            className="w-full bg-orange-500 hover:bg-orange-600 py-5 rounded-[2rem] font-black text-white shadow-2xl shadow-orange-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Actualizar Identidad"}
          </button>
        </div>
      </form>
    </div>
  );
}
