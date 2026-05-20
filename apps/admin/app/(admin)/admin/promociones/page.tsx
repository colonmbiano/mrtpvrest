"use client";
import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

type Location = {
  id: string;
  name: string;
  autoPromoEnabled: boolean;
  autoPromoThreshold: number;
  autoPromoDiscount: number;
};

type PromoItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  promoPrice: number | null;
  isPromo: boolean;
  soldLast7Days: number;
  category: { name: string };
  updatedAt: string;
};

export default function PromocionesPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [promoItems, setPromoItems] = useState<PromoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string>("all");

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/promos");
      setLocations(data.locations || []);
      setPromoItems(data.promoItems || []);
    } catch {
      showToast("Error al cargar promociones", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleTrigger = async (locationId?: string) => {
    const key = locationId || "all";
    setTriggering(key);
    try {
      await api.post("/api/admin/promos/trigger", locationId ? { locationId } : {});
      showToast("✅ Motor iniciado. Analizando ventas con IA...");
      setTimeout(() => fetchData(), 3000);
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al iniciar motor", false);
    } finally {
      setTriggering(null);
    }
  };

  const handleToggleItem = async (item: PromoItem) => {
    setTogglingItem(item.id);
    try {
      await api.put(`/api/admin/promos/${item.id}`, {
        isPromo: !item.isPromo,
        promoPrice: item.isPromo ? null : item.promoPrice,
      });
      showToast(item.isPromo ? "Promo desactivada" : "🎉 Promo activada");
      fetchData();
    } catch (e: any) {
      showToast(e?.response?.data?.error || "Error al actualizar", false);
    } finally {
      setTogglingItem(null);
    }
  };

  const enabledLocations = locations.filter(l => l.autoPromoEnabled);
  const disabledLocations = locations.filter(l => !l.autoPromoEnabled);
  const discount = (price: number, promo: number) =>
    Math.round(((price - promo) / price) * 100);

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="w-12 h-12 border-t-2 border-orange-500 rounded-full animate-spin" />
      <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Cargando promociones...</p>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto p-6 sm:p-8 font-sans text-white">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3.5 rounded-2xl text-sm font-bold shadow-2xl transition-all animate-in slide-in-from-top-2 ${
          toast.ok ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-black uppercase tracking-tighter mb-2">
              Promociones <span className="text-orange-500">IA</span>
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">
              Motor automático de descuentos con inteligencia artificial
            </p>
          </div>
          <button
            onClick={() => handleTrigger()}
            disabled={triggering === "all" || enabledLocations.length === 0}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-widest px-5 py-3.5 rounded-2xl transition-all active:scale-95 shadow-lg shadow-orange-500/20"
          >
            {triggering === "all" ? (
              <><div className="w-4 h-4 border-t-2 border-white rounded-full animate-spin" />Analizando...</>
            ) : (
              <><span className="text-base">🤖</span> Analizar Todas</>
            )}
          </button>
        </div>
      </div>

      {/* Sucursales */}
      <div className="mb-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Configuración por Sucursal</h2>
        {locations.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-gray-700 rounded-[2rem] p-8 text-center">
            <p className="text-gray-500 text-sm font-bold">Sin sucursales</p>
            <p className="text-gray-700 text-xs mt-1">Crea sucursales desde <strong className="text-gray-500">Mi Marca</strong></p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {locations.map(loc => (
              <div key={loc.id} className={`bg-[#111] rounded-[1.75rem] p-5 border transition-all ${
                loc.autoPromoEnabled ? "border-orange-500/30" : "border-gray-800"
              }`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-sm">{loc.name}</p>
                    <div className={`mt-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full ${
                      loc.autoPromoEnabled
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-gray-800 text-gray-500"
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${loc.autoPromoEnabled ? "bg-orange-500 animate-pulse" : "bg-gray-600"}`} />
                      {loc.autoPromoEnabled ? "IA Activa" : "IA Inactiva"}
                    </div>
                  </div>
                  {loc.autoPromoEnabled && (
                    <button
                      onClick={() => handleTrigger(loc.id)}
                      disabled={triggering === loc.id}
                      className="text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 border border-orange-500/30 hover:border-orange-500/60 px-3 py-1.5 rounded-xl transition-all disabled:opacity-50"
                    >
                      {triggering === loc.id ? "..." : "Analizar"}
                    </button>
                  )}
                </div>
                {loc.autoPromoEnabled && (
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-800">
                    <div>
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">Umbral ventas/semana</p>
                      <p className="text-lg font-black text-white mt-0.5">&lt;{loc.autoPromoThreshold}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider font-bold">Descuento automático</p>
                      <p className="text-lg font-black text-orange-400 mt-0.5">{loc.autoPromoDiscount}%</p>
                    </div>
                  </div>
                )}
                {!loc.autoPromoEnabled && (
                  <p className="text-[10px] text-gray-600 mt-2">
                    Actívala desde <strong className="text-gray-500">Mi Marca → Sucursales → Editar</strong>
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estadísticas rápidas */}
      {promoItems.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-[#111] border border-gray-800 rounded-[1.75rem] p-5 text-center">
            <p className="text-3xl font-black text-orange-400">{promoItems.length}</p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1">En promo ahora</p>
          </div>
          <div className="bg-[#111] border border-gray-800 rounded-[1.75rem] p-5 text-center">
            <p className="text-3xl font-black text-emerald-400">
              {promoItems.reduce((s, i) => s + (i.soldLast7Days || 0), 0)}
            </p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1">Vendidos (7 días)</p>
          </div>
          <div className="bg-[#111] border border-gray-800 rounded-[1.75rem] p-5 text-center">
            <p className="text-3xl font-black text-blue-400">
              {promoItems.length > 0
                ? Math.round(promoItems.reduce((s, i) => s + (i.price > 0 && i.promoPrice ? discount(i.price, i.promoPrice) : 0), 0) / promoItems.length)
                : 0}%
            </p>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-bold mt-1">Descuento promedio</p>
          </div>
        </div>
      )}

      {/* Items en promo */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-gray-500">
            Platillos en Promoción {promoItems.length > 0 && `(${promoItems.length})`}
          </h2>
        </div>

        {promoItems.length === 0 ? (
          <div className="bg-[#111] border border-dashed border-gray-700 rounded-[2rem] p-12 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <p className="text-white font-black text-base mb-2">Sin platillos en promo actualmente</p>
            <p className="text-gray-500 text-sm max-w-sm mx-auto leading-relaxed">
              Activa el motor IA en tus sucursales y presiona <strong className="text-orange-400">Analizar Todas</strong> para que la IA identifique qué platillos necesitan un empujón.
            </p>
            {enabledLocations.length > 0 && (
              <button
                onClick={() => handleTrigger()}
                disabled={triggering === "all"}
                className="mt-6 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs uppercase tracking-widest px-6 py-3.5 rounded-2xl transition-all active:scale-95 shadow-lg shadow-orange-500/20"
              >
                {triggering === "all" ? "Analizando..." : "🤖 Ejecutar Motor IA"}
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {promoItems.map(item => (
              <div key={item.id} className="bg-[#111] border border-orange-500/20 rounded-[1.75rem] p-5 flex gap-4">
                {/* Imagen */}
                <div className="w-16 h-16 rounded-2xl bg-gray-900 flex-shrink-0 overflow-hidden border border-gray-800">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-sm leading-tight">{item.name}</p>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-wider mt-0.5">{item.category.name}</p>
                    </div>
                    <button
                      onClick={() => handleToggleItem(item)}
                      disabled={togglingItem === item.id}
                      className={`flex-shrink-0 relative w-10 h-5 rounded-full transition-all border ${
                        item.isPromo
                          ? "bg-orange-500 border-orange-500"
                          : "bg-gray-800 border-gray-700"
                      } disabled:opacity-50`}
                      title={item.isPromo ? "Desactivar promo" : "Activar promo"}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${item.isPromo ? "translate-x-5" : "translate-x-0"}`} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-2.5">
                    {item.promoPrice && (
                      <>
                        <span className="text-gray-500 line-through text-xs">${item.price.toFixed(2)}</span>
                        <span className="text-orange-400 font-black text-sm">${item.promoPrice.toFixed(2)}</span>
                        <span className="bg-orange-500/15 text-orange-400 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                          -{discount(item.price, item.promoPrice)}%
                        </span>
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-4 mt-2 pt-2 border-t border-gray-800/60">
                    <div>
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider">Vendidos 7d</p>
                      <p className={`text-sm font-black ${item.soldLast7Days < 5 ? "text-red-400" : "text-emerald-400"}`}>
                        {item.soldLast7Days}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] text-gray-600 uppercase tracking-wider">Actualizado</p>
                      <p className="text-[10px] text-gray-500">
                        {new Date(item.updatedAt).toLocaleDateString("es-MX", { day: "2-digit", month: "short" })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sucursales sin IA */}
      {disabledLocations.length > 0 && (
        <div className="mt-8 bg-gray-900/40 border border-dashed border-gray-700 rounded-[2rem] p-6 flex items-center gap-4">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm font-bold text-gray-300">
              {disabledLocations.length} {disabledLocations.length === 1 ? "sucursal sin" : "sucursales sin"} IA activada
            </p>
            <p className="text-xs text-gray-600 mt-0.5">
              Ve a <strong className="text-orange-400">Mi Marca → Sucursales → Editar</strong> para activar el motor de promociones por sucursal.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
