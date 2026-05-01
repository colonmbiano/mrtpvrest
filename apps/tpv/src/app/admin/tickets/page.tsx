"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";

type TicketConfig = {
  id?: string;
  headerText: string;
  footerText: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showWifi: boolean;
  wifiSsid?: string | null;
  wifiPassword?: string | null;
};

export default function TicketConfigPage() {
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/admin/ticket-settings");
      if (data) setConfig(data);
    } catch (e) {
      console.error(e);
      // Fallback
      setConfig({
        headerText: "¡Bienvenidos a nuestro restaurante!",
        footerText: "Gracias por su preferencia",
        showLogo: true,
        showAddress: true,
        showPhone: true,
        showWifi: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      await api.put("/api/admin/ticket-settings", config);
      alert("Configuración guardada exitosamente");
    } catch (err) {
      alert("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-gray-400">Cargando configuración...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-black mb-2 text-white">Configurador de Tickets</h1>
      <p className="text-gray-400 mb-8">Personaliza la información que aparece en los tickets impresos.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <form onSubmit={handleSave} className="bg-[#141417] p-6 rounded-2xl border border-[#2d2d30] space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-400 mb-1">Texto de Encabezado</label>
            <textarea
              rows={3}
              value={config?.headerText || ""}
              onChange={(e) => setConfig({ ...config!, headerText: e.target.value })}
              className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              placeholder="Ej. ¡Bienvenidos a Master Burger's!"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-1">Texto de Pie de Página</label>
            <textarea
              rows={3}
              value={config?.footerText || ""}
              onChange={(e) => setConfig({ ...config!, footerText: e.target.value })}
              className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              placeholder="Ej. ¡Vuelve pronto! Propina no incluida."
            />
          </div>

          <div className="space-y-3 pt-4 border-t border-[#2d2d30]">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showLogo}
                onChange={(e) => setConfig({ ...config!, showLogo: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Imprimir Logo del Negocio</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showAddress}
                onChange={(e) => setConfig({ ...config!, showAddress: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Incluir Dirección</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showPhone}
                onChange={(e) => setConfig({ ...config!, showPhone: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Incluir Teléfono</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showWifi}
                onChange={(e) => setConfig({ ...config!, showWifi: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Mostrar credenciales WiFi</span>
            </label>
          </div>

          {config?.showWifi && (
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Red (SSID)</label>
                <input
                  value={config.wifiSsid || ""}
                  onChange={(e) => setConfig({ ...config, wifiSsid: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-lg px-3 py-1.5 text-white focus:border-[#ffb84d] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Contraseña</label>
                <input
                  value={config.wifiPassword || ""}
                  onChange={(e) => setConfig({ ...config, wifiPassword: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-lg px-3 py-1.5 text-white focus:border-[#ffb84d] outline-none"
                />
              </div>
            </div>
          )}

          <div className="pt-6">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#ffb84d] text-black py-3 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar Configuración"}
            </button>
          </div>
        </form>

        {/* Vista Previa Ticket */}
        <div className="flex justify-center items-start">
          <div className="bg-white w-72 p-6 shadow-xl flex flex-col items-center text-center font-mono text-black">
            {config?.showLogo && (
              <div className="w-16 h-16 border-2 border-black border-dashed flex items-center justify-center mb-4">
                <span className="text-xs font-bold">LOGO</span>
              </div>
            )}
            
            <p className="text-sm font-bold mb-4 whitespace-pre-wrap">{config?.headerText || "Encabezado"}</p>
            
            {config?.showAddress && <p className="text-xs mb-1">Av. Principal 123, Ciudad</p>}
            {config?.showPhone && <p className="text-xs mb-4">Tel: (555) 123-4567</p>}

            <div className="w-full border-t border-dashed border-gray-400 my-4" />
            <div className="w-full text-left text-xs mb-2">
              <p>1x Burger Especial <span className="float-right">$12.50</span></p>
              <p>1x Papas Fritas <span className="float-right">$4.00</span></p>
            </div>
            <div className="w-full text-right font-bold text-sm">TOTAL: $16.50</div>
            <div className="w-full border-t border-dashed border-gray-400 my-4" />

            {config?.showWifi && (
              <div className="w-full text-center text-xs mb-4 border border-gray-300 p-2">
                <p className="font-bold">WiFi Invitados</p>
                <p>Red: {config.wifiSsid || "MiRed"}</p>
                <p>Pass: {config.wifiPassword || "********"}</p>
              </div>
            )}

            <p className="text-xs whitespace-pre-wrap">{config?.footerText || "Pie de página"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
