"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";
import { getStoreUrl } from "@/lib/config";

export default function TiendaConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"" | "loading" | "ok" | "error">("");
  const [config, setConfig] = useState({
    slug: "",
    phone: "",
    address: "",
    whatsappNumber: "",
    deliveryFee: 0,
    minOrderAmount: 0,
    freeDeliveryFrom: 0,
    estimatedDelivery: 40,
    storefrontTheme: "KAWAII",
    // Estado de la tienda
    isOpen: true,
    closedMessage: "",
    // Envío por distancia
    deliveryMode: "FLAT" as "FLAT" | "DISTANCE",
    originLat: null as number | null,
    originLng: null as number | null,
    deliveryBaseFee: 0,
    deliveryPerKm: 0,
    deliveryFreeRadiusKm: null as number | null,
    deliveryMaxKm: null as number | null,
    // Programa de puntos
    pointsPerTen: 1,
    pointsValuePesos: 0.1,
  });

  const useMyLocation = () => {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setConfig(p => ({ ...p, originLat: pos.coords.latitude, originLng: pos.coords.longitude }));
        setGeoStatus("ok");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const storeUrl = config.slug ? getStoreUrl(config.slug) : "";

  const copyStoreUrl = async () => {
    if (!storeUrl) return;
    try {
      await navigator.clipboard.writeText(storeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { alert("No se pudo copiar el enlace"); }
  };

  useEffect(() => {
    api.get("/api/admin/config")
      .then(res => {
        const d = res.data || {};
        setConfig(prev => ({
          ...prev,
          ...d,
          freeDeliveryFrom: d.freeDeliveryFrom ?? 0,
          closedMessage: d.closedMessage ?? "",
          deliveryMode: d.deliveryMode === "DISTANCE" ? "DISTANCE" : "FLAT",
          isOpen: d.isOpen ?? true,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const { slug: _slug, ...rest } = config;
      await api.put("/api/admin/config", {
        ...rest,
        freeDeliveryFrom: config.freeDeliveryFrom > 0 ? config.freeDeliveryFrom : null,
      });
      window.location.reload();
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "Error desconocido";
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
        <h1 className="text-5xl font-black mb-2 uppercase tracking-tighter">Tienda</h1>
        <p className="text-gray-500 font-bold uppercase text-[10px] tracking-[0.2em]">Configura tu tienda online y reglas de pedido</p>
      </div>

      <div className="space-y-6">
        {/* Estado de la tienda */}
        <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-black uppercase tracking-tighter">Estado de la Tienda</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
                {config.isOpen ? "Abierta — recibiendo pedidos" : "Cerrada — pedidos bloqueados"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfig(p => ({ ...p, isOpen: !p.isOpen }))}
              className={`relative w-16 h-9 rounded-full transition-all flex-shrink-0 ${config.isOpen ? "bg-emerald-500" : "bg-gray-700"}`}
              aria-pressed={config.isOpen}
            >
              <span className={`absolute top-1 w-7 h-7 bg-white rounded-full transition-all ${config.isOpen ? "left-8" : "left-1"}`} />
            </button>
          </div>
          {!config.isOpen && (
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Mensaje al cliente (tienda cerrada)</label>
              <input type="text" value={config.closedMessage} placeholder="Ej. Volvemos mañana a las 9:00 am" onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, closedMessage: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
          )}
        </div>

        {/* Contacto y tema */}
        <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 space-y-6">
          <div>
            <p className="text-sm font-black uppercase tracking-tighter">Contacto Público</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Datos que verá el cliente en tu tienda</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Teléfono</label>
              <input type="text" value={config.phone} onChange={(e) => { const v = e.target.value; setConfig(p => ({...p, phone: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Mensajeria</label>
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

        {/* Envíos y reglas de la tienda online */}
        <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 space-y-6">
          <div>
            <p className="text-sm font-black uppercase tracking-tighter">Envíos y Reglas de Pedido</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Reglas que verá el cliente al pedir</p>
          </div>

          {/* Modo de cobro de envío */}
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-3 block tracking-widest">Modo de cobro de envío</label>
            <div className="grid grid-cols-2 gap-4">
              {[
                { id: "FLAT", name: "Tarifa fija", desc: "Un costo único para todos" },
                { id: "DISTANCE", name: "Por distancia", desc: "Base + costo por km" },
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setConfig(p => ({ ...p, deliveryMode: m.id as "FLAT" | "DISTANCE" }))}
                  className={`p-4 rounded-3xl border-2 transition-all text-left ${
                    config.deliveryMode === m.id ? "border-orange-500 bg-orange-500/10" : "border-white/5 bg-black hover:border-white/20"
                  }`}
                >
                  <p className="font-black text-sm uppercase tracking-tight">{m.name}</p>
                  <p className="text-[10px] text-gray-500 font-bold">{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Campos comunes */}
          <div className="grid grid-cols-2 gap-4">
            {config.deliveryMode === "FLAT" && (
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Costo de envío ($)</label>
                <input type="number" min="0" value={config.deliveryFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, deliveryFee: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              </div>
            )}
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Compra mínima ($)</label>
              <input type="number" min="0" value={config.minOrderAmount} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, minOrderAmount: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Envío gratis desde ($)</label>
              <input type="number" min="0" value={config.freeDeliveryFrom} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, freeDeliveryFrom: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
              <p className="text-[9px] text-gray-600 mt-1 ml-2">0 = sin envío gratis por monto</p>
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Tiempo estimado (min)</label>
              <input type="number" min="0" value={config.estimatedDelivery} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig(p => ({...p, estimatedDelivery: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
          </div>

          {/* Configuración por distancia */}
          {config.deliveryMode === "DISTANCE" && (
            <div className="bg-black/50 p-6 rounded-3xl border border-orange-500/20 space-y-5">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-orange-400">Origen de la tienda</p>
                  <p className="text-[10px] text-gray-500 font-bold mt-0.5">
                    {config.originLat != null && config.originLng != null
                      ? `${config.originLat.toFixed(5)}, ${config.originLng.toFixed(5)}`
                      : "Sin ubicación — define el punto de salida"}
                  </p>
                </div>
                <button type="button" onClick={useMyLocation} className="text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-all">
                  {geoStatus === "loading" ? "Obteniendo..." : "📍 Usar mi ubicación"}
                </button>
              </div>
              {geoStatus === "error" && <p className="text-red-400 text-[10px] font-bold">No se pudo obtener la ubicación. Permite el acceso al GPS o ingrésala manualmente.</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Latitud</label>
                  <input type="number" step="any" value={config.originLat ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({...p, originLat: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Longitud</label>
                  <input type="number" step="any" value={config.originLng ?? ""} onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({...p, originLng: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Tarifa base ($)</label>
                  <input type="number" min="0" value={config.deliveryBaseFee} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, deliveryBaseFee: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Costo por km ($)</label>
                  <input type="number" min="0" value={config.deliveryPerKm} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, deliveryPerKm: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Radio gratis (km)</label>
                  <input type="number" min="0" step="any" value={config.deliveryFreeRadiusKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({...p, deliveryFreeRadiusKm: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                  <p className="text-[9px] text-gray-600 mt-1 ml-2">Dentro de este radio el envío es gratis</p>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Distancia máxima (km)</label>
                  <input type="number" min="0" step="any" value={config.deliveryMaxKm ?? ""} placeholder="opcional" onChange={(e) => { const v = e.target.value === "" ? null : parseFloat(e.target.value); setConfig(p => ({...p, deliveryMaxKm: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
                  <p className="text-[9px] text-gray-600 mt-1 ml-2">Fuera de este radio no hay cobertura</p>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 font-bold leading-relaxed">
                Fórmula: <span className="text-orange-400">tarifa base + (costo por km × distancia)</span>. La distancia se mide en línea recta desde el origen hasta la ubicación GPS del cliente en el checkout.
              </p>
            </div>
          )}
        </div>

        {/* Programa de puntos */}
        <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8 space-y-6">
          <div>
            <p className="text-sm font-black uppercase tracking-tighter">Programa de Puntos</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">Lealtad de tus clientes</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Puntos por cada $10</label>
              <input type="number" min="0" value={config.pointsPerTen} onChange={(e) => { const v = parseInt(e.target.value) || 0; setConfig(p => ({...p, pointsPerTen: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-500 uppercase ml-2 mb-1 block tracking-widest">Valor del punto ($)</label>
              <input type="number" min="0" step="any" value={config.pointsValuePesos} onChange={(e) => { const v = parseFloat(e.target.value) || 0; setConfig(p => ({...p, pointsValuePesos: v})); }} className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 outline-none focus:border-orange-500 transition-all text-sm font-bold" />
            </div>
          </div>
        </div>

        {/* Enlace público de la tienda */}
        {storeUrl && (
          <div className="bg-[#111] border border-gray-800 rounded-[2.5rem] p-8">
            <p className="text-sm font-black uppercase tracking-tighter mb-1">Tu Tienda Online</p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-6">Comparte este enlace o QR con tus clientes</p>
            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(storeUrl)}`}
                alt="QR de la tienda"
                width={150}
                height={150}
                className="rounded-2xl bg-white p-2 shrink-0"
              />
              <div className="flex-1 w-full space-y-3">
                <div className="bg-black border border-white/10 rounded-2xl px-5 py-4 font-mono text-sm text-orange-400 break-all">{storeUrl}</div>
                <div className="flex gap-3">
                  <button type="button" onClick={copyStoreUrl} className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest border border-gray-700 text-gray-300 hover:border-orange-500/50 hover:text-orange-400 transition-all">
                    {copied ? "¡Copiado!" : "Copiar enlace"}
                  </button>
                  <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="flex-1 text-center py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-orange-500 hover:bg-orange-600 text-white transition-all">
                    Ver tienda
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-orange-500 hover:bg-orange-600 py-5 rounded-[2rem] font-black text-white shadow-2xl shadow-orange-500/20 active:scale-95 transition-all uppercase tracking-widest disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar Tienda"}
        </button>
      </div>
    </div>
  );
}
