"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function DeliverySetupPage() {
  const [restaurantId, setRestaurantId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedRestId = localStorage.getItem("restaurantId");
    const savedLocId = localStorage.getItem("locationId");
    if (savedRestId) setRestaurantId(savedRestId);
    if (savedLocId) setLocationId(savedLocId);
  }, []);

  const handleSave = () => {
    if (!restaurantId || !locationId) {
      alert("Por favor ingrese ambos IDs.");
      return;
    }
    localStorage.setItem("restaurantId", restaurantId);
    localStorage.setItem("locationId", locationId);
    setIsSaved(true);
    setTimeout(() => {
      router.push("/"); // Redirigir al home del repartidor
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] p-6 font-syne">
      <div className="max-w-md w-full bg-[#111] border border-white/5 rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-10">
          <div className="text-4xl mb-4">🛵</div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter italic">
            Delivery <span className="text-orange-500">Setup</span>
          </h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-2">
            Configuración del Dispositivo
          </p>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase ml-2 mb-2 tracking-widest">
              ID del Restaurante
            </label>
            <input
              type="text"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              placeholder="Ej: cmnapa..."
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-mono outline-none focus:border-orange-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black text-gray-500 uppercase ml-2 mb-2 tracking-widest">
              ID de la Sucursal
            </label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Ej: cmnapx..."
              className="w-full bg-black border border-white/10 rounded-2xl px-5 py-4 text-white text-sm font-mono outline-none focus:border-orange-500 transition-all"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaved}
            className={`w-full py-5 rounded-[1.5rem] font-black uppercase tracking-tighter text-lg transition-all shadow-xl active:scale-95 ${
              isSaved ? "bg-green-500 text-white" : "bg-orange-500 text-white hover:bg-orange-600"
            }`}
          >
            {isSaved ? "¡CONFIGURADO!" : "ACTIVAR TERMINAL"}
          </button>
        </div>

        <p className="mt-10 text-[9px] text-center text-gray-600 font-bold uppercase tracking-[0.2em] leading-relaxed">
          Este paso vincula este celular a una sucursal específica para el rastreo GPS.
        </p>
      </div>
    </div>
  );
}
