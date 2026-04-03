"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
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
      router.push("/login");
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-center mb-6 text-gray-800">
          Configuración MRTPVREST
        </h1>
        <p className="text-sm text-gray-600 mb-8 text-center">
          Configure este dispositivo para su restaurante y sucursal.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID del Restaurante
            </label>
            <input
              type="text"
              value={restaurantId}
              onChange={(e) => setRestaurantId(e.target.value)}
              placeholder="Ej: cmnapa0p60000j9..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 text-black"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID de la Sucursal
            </label>
            <input
              type="text"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              placeholder="Ej: cmnapxgb100013..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-orange-500 focus:border-orange-500 text-black"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaved}
            className={`w-full py-3 rounded-md font-semibold text-white transition-colors ${
              isSaved ? "bg-green-500" : "bg-orange-500 hover:bg-orange-600"
            }`}
          >
            {isSaved ? "¡Configuración Guardada!" : "Guardar Configuración"}
          </button>
        </div>

        <div className="mt-8 text-xs text-center text-gray-400">
          Estos IDs identifican este dispositivo de forma única en su red SaaS.
        </div>
      </div>
    </div>
  );
}
