"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";
import BackButton from "@/components/BackButton";

type TicketConfig = {
  id?: string;
  locationId?: string;
  businessName: string;
  header: string;
  subheader: string;
  footer: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  address: string;
  phone: string;

  // Nuevas opciones
  paperWidth: string;
  fontFamily: string;
  fontSize: string;
  compactMode: boolean;
  showOrderNumber: boolean;
  showCustomerData: boolean;
  showItemsPrice: boolean;

  showWifi: boolean;
  wifiSsid?: string | null;
  wifiPassword?: string | null;

  // Comanda (kitchen ticket) — toggles independientes del recibo cliente.
  kitchenHeader: string;
  kitchenFooter: string;
  kitchenShowOrderNumber: boolean;
  kitchenShowTime: boolean;
  kitchenShowType: boolean;
  kitchenShowTable: boolean;
  kitchenShowCustomer: boolean;
  kitchenShowModifiers: boolean;
  kitchenShowNotes: boolean;
  kitchenGroupBySeat: boolean;
  kitchenFontSize: "normal" | "large" | "xlarge";
};

export default function TicketConfigPage() {
  const [config, setConfig] = useState<TicketConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/printers/ticket-config");
      if (data) {
        // Backend puede no traer aún los kitchen* si la migración es nueva
        // o si era un registro viejo — los cubrimos con defaults para que
        // los toggles tengan valor inicial coherente.
        setConfig({
          kitchenHeader: "COMANDA",
          kitchenFooter: "",
          kitchenShowOrderNumber: true,
          kitchenShowTime: true,
          kitchenShowType: true,
          kitchenShowTable: true,
          kitchenShowCustomer: true,
          kitchenShowModifiers: true,
          kitchenShowNotes: true,
          kitchenGroupBySeat: true,
          kitchenFontSize: "large",
          ...data,
        });
      }
    } catch (e) {
      console.error(e);
      // Fallback con los nuevos campos
      setConfig({
        businessName: "Restaurante Demo",
        header: "¡Bienvenidos a nuestro restaurante!",
        subheader: "",
        footer: "Gracias por su preferencia",
        showLogo: true,
        showAddress: true,
        showPhone: true,
        address: "Av. Principal 123, Ciudad",
        phone: "(555) 123-4567",
        paperWidth: "80mm",
        fontFamily: "monospace",
        fontSize: "medium",
        compactMode: false,
        showOrderNumber: true,
        showCustomerData: true,
        showItemsPrice: true,
        showWifi: false,
        kitchenHeader: "COMANDA",
        kitchenFooter: "",
        kitchenShowOrderNumber: true,
        kitchenShowTime: true,
        kitchenShowType: true,
        kitchenShowTable: true,
        kitchenShowCustomer: true,
        kitchenShowModifiers: true,
        kitchenShowNotes: true,
        kitchenGroupBySeat: true,
        kitchenFontSize: "large",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    // Arranque diferido (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchConfig(); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setSaving(true);
    try {
      await api.put("/api/printers/ticket-config", config);
      // Notifica a los hooks de impresión que recarguen — sin esto, las
      // tablets necesitan refrescar la app para tomar el cambio nuevo.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("ticket-config-changed"));
      }
      alert("Configuración guardada exitosamente");
    } catch {
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
      <div className="flex items-start gap-4 mb-8">
        <BackButton ariaLabel="Volver al panel admin" />
        <div>
          <h1 className="text-3xl font-black mb-2 text-white">Configurador de Tickets</h1>
          <p className="text-gray-400">Personaliza la información que aparece en los tickets impresos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Formulario de Configuración */}
        <form onSubmit={handleSave} className="lg:col-span-7 bg-[#141417] p-6 rounded-2xl border border-[#2d2d30] space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Nombre del Negocio</label>
              <input
                type="text"
                value={config?.businessName || ""}
                onChange={(e) => setConfig({ ...config!, businessName: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Teléfono</label>
              <input
                type="text"
                value={config?.phone || ""}
                onChange={(e) => setConfig({ ...config!, phone: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-400 mb-1">Dirección</label>
            <input
              type="text"
              value={config?.address || ""}
              onChange={(e) => setConfig({ ...config!, address: e.target.value })}
              className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Texto de Encabezado</label>
              <textarea
                rows={3}
                value={config?.header || ""}
                onChange={(e) => setConfig({ ...config!, header: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                placeholder="Ej. ¡Bienvenidos!"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Texto de Pie de Página</label>
              <textarea
                rows={3}
                value={config?.footer || ""}
                onChange={(e) => setConfig({ ...config!, footer: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                placeholder="Ej. ¡Vuelve pronto!"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-[#2d2d30]">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-[#ffb84d] rounded-full"></span>
              Opciones de Diseño
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Ancho de Papel</label>
                <select
                  value={config?.paperWidth}
                  onChange={(e) => setConfig({ ...config!, paperWidth: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-lg px-3 py-2 text-white outline-none focus:border-[#ffb84d]"
                >
                  <option value="80mm">80mm</option>
                  <option value="58mm">58mm</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Tipo de Letra</label>
                <select
                  value={config?.fontFamily}
                  onChange={(e) => setConfig({ ...config!, fontFamily: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-lg px-3 py-2 text-white outline-none focus:border-[#ffb84d]"
                >
                  <option value="monospace">Monospace</option>
                  <option value="sans-serif">Sans Serif</option>
                  <option value="serif">Serif</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Tamaño de Letra</label>
                <select
                  value={config?.fontSize}
                  onChange={(e) => setConfig({ ...config!, fontSize: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-lg px-3 py-2 text-white outline-none focus:border-[#ffb84d]"
                >
                  <option value="small">Pequeño</option>
                  <option value="medium">Mediano</option>
                  <option value="large">Grande</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showLogo}
                onChange={(e) => setConfig({ ...config!, showLogo: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Imprimir Logo</span>
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
                checked={config?.showOrderNumber}
                onChange={(e) => setConfig({ ...config!, showOrderNumber: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Número de Orden</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showItemsPrice}
                onChange={(e) => setConfig({ ...config!, showItemsPrice: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Precios por Item</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.compactMode}
                onChange={(e) => setConfig({ ...config!, compactMode: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Modo Compacto</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={config?.showWifi}
                onChange={(e) => setConfig({ ...config!, showWifi: e.target.checked })}
                className="w-5 h-5 accent-[#ffb84d] bg-[#0a0a0c] border-[#2d2d30] rounded"
              />
              <span className="text-sm font-bold text-gray-300">Mostrar WiFi</span>
            </label>
          </div>

          {config?.showWifi && (
            <div className="grid grid-cols-2 gap-4 bg-[#0a0a0c] p-4 rounded-xl border border-[#2d2d30]">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Red (SSID)</label>
                <input
                  value={config.wifiSsid || ""}
                  onChange={(e) => setConfig({ ...config, wifiSsid: e.target.value })}
                  className="w-full bg-[#141417] border border-[#2d2d30] rounded-lg px-3 py-1.5 text-white focus:border-[#ffb84d] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Contraseña</label>
                <input
                  value={config.wifiPassword || ""}
                  onChange={(e) => setConfig({ ...config, wifiPassword: e.target.value })}
                  className="w-full bg-[#141417] border border-[#2d2d30] rounded-lg px-3 py-1.5 text-white focus:border-[#ffb84d] outline-none"
                />
              </div>
            </div>
          )}

          {/* ─── Configuración de Comandas (kitchen ticket) ─── */}
          <div className="pt-6 border-t border-[#2d2d30]">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-[#88D66C] rounded-full"></span>
              Configuración de Comandas (cocina)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Título de la comanda</label>
                <input
                  type="text"
                  value={config?.kitchenHeader ?? "COMANDA"}
                  onChange={(e) => setConfig({ ...config!, kitchenHeader: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                  placeholder="COMANDA"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1">Tamaño de letra de items</label>
                <select
                  value={config?.kitchenFontSize ?? "large"}
                  onChange={(e) => setConfig({ ...config!, kitchenFontSize: e.target.value as "normal" | "large" | "xlarge" })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                >
                  <option value="normal">Normal</option>
                  <option value="large">Grande (doble ancho)</option>
                  <option value="xlarge">Extra grande (triple)</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-400 mb-1">Pie de comanda (opcional)</label>
              <textarea
                rows={2}
                value={config?.kitchenFooter ?? ""}
                onChange={(e) => setConfig({ ...config!, kitchenFooter: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                placeholder="Verificar antes de servir"
              />
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                { key: "kitchenShowOrderNumber", label: "Número de orden (#TPV-…)" },
                { key: "kitchenShowTime",        label: "Hora" },
                { key: "kitchenShowType",        label: "Tipo (Comer aquí / Llevar / Delivery)" },
                { key: "kitchenShowTable",       label: "Número de mesa" },
                { key: "kitchenShowCustomer",    label: "Nombre del cliente" },
                { key: "kitchenShowModifiers",   label: "Modificadores (+ Picante)" },
                { key: "kitchenShowNotes",       label: "Notas (> sin queso)" },
                { key: "kitchenGroupBySeat",     label: "Agrupar por COMENSAL en mesa" },
              ].map((opt) => (
                <label key={opt.key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean((config as unknown as Record<string, boolean>)?.[opt.key])}
                    onChange={(e) =>
                      setConfig({ ...(config as TicketConfig), [opt.key]: e.target.checked })
                    }
                    className="w-5 h-5 accent-[#88D66C] bg-[#0a0a0c] border-[#2d2d30] rounded"
                  />
                  <span className="text-sm font-bold text-gray-300">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <button
              type="submit"
              disabled={saving}
              className="w-full bg-[#ffb84d] text-black py-4 rounded-xl font-black text-lg transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 shadow-lg shadow-[#ffb84d]/20"
            >
              {saving ? "Guardando..." : "Guardar Configuración"}
            </button>
          </div>
        </form>

        {/* Vista Previa Ticket */}
        <div className="lg:col-span-5 flex flex-col items-center">
          <p className="text-gray-400 text-sm font-bold mb-4 uppercase tracking-widest">Vista Previa Realista</p>
          <div 
            className="bg-white shadow-2xl flex flex-col items-center text-center text-black overflow-hidden transition-all duration-500 ease-in-out"
            style={{ 
              width: config?.paperWidth === "58mm" ? "240px" : "320px",
              padding: config?.compactMode ? "12px" : "24px",
              fontFamily: config?.fontFamily || "monospace",
              fontSize: config?.fontSize === "small" ? "11px" : config?.fontSize === "large" ? "15px" : "13px"
            }}
          >
            {config?.showLogo && (
              <div className="w-16 h-16 border-2 border-black border-dashed flex items-center justify-center mb-4">
                <span className="text-xs font-bold">LOGO</span>
              </div>
            )}

            <h2 className="text-lg font-black mb-1 uppercase">{config?.businessName || "MI NEGOCIO"}</h2>
            <p className="font-bold mb-2 whitespace-pre-wrap leading-tight">{config?.header || "Encabezado"}</p>

            {config?.showAddress && config?.address && <p className="opacity-80 mb-0.5">{config.address}</p>}
            {config?.showPhone && config?.phone && <p className="opacity-80 mb-4">Tel: {config.phone}</p>}

            {config?.showOrderNumber && (
              <div className="w-full border-y border-dashed border-black py-2 mb-4">
                <p className="text-xl font-black">ORDEN #042</p>
                <p className="text-[10px] opacity-60">09 May 2026 - 02:15 PM</p>
              </div>
            )}

            <div className="w-full text-left space-y-1 mb-4">
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span>1x Burger Especial</span>
                {config?.showItemsPrice && <span>$12.50</span>}
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span>1x Papas Fritas</span>
                {config?.showItemsPrice && <span>$4.00</span>}
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-1">
                <span>1x Coca Cola 600ml</span>
                {config?.showItemsPrice && <span>$2.50</span>}
              </div>
            </div>

            <div className="w-full flex justify-between font-black text-lg border-t-2 border-black pt-2 mb-4">
              <span>TOTAL:</span>
              <span>$19.00</span>
            </div>

            {config?.showWifi && (
              <div className="w-full text-center text-[11px] mb-4 border border-black p-2 bg-gray-50 rounded">
                <p className="font-black uppercase mb-1">Acceso WiFi</p>
                <p>RED: {config.wifiSsid || "MiRed"}</p>
                <p>PASS: {config.wifiPassword || "********"}</p>
              </div>
            )}

            <p className="whitespace-pre-wrap leading-tight">{config?.footer || "Pie de página"}</p>
            
            <div className="mt-8 opacity-20 text-[10px]">
              <p>***************************</p>
              <p>mrtpvrest.com</p>
            </div>
          </div>
          
          <div className="mt-6 flex gap-4 text-xs text-gray-500 italic">
            <span className="flex items-center gap-1">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              Cambios en tiempo real
            </span>
          </div>

          {/* ─── Vista previa Comanda (cocina) ─── */}
          <p className="text-gray-400 text-sm font-bold mt-10 mb-4 uppercase tracking-widest">
            Vista previa Comanda
          </p>
          <div
            className="bg-white shadow-2xl flex flex-col items-center text-center text-black overflow-hidden transition-all duration-500 ease-in-out"
            style={{
              width: "280px",
              padding: "20px",
              fontFamily: "monospace",
              fontSize:
                config?.kitchenFontSize === "xlarge" ? "20px" :
                config?.kitchenFontSize === "normal" ? "13px" : "16px",
              lineHeight: 1.25,
            }}
          >
            <h2 className="text-2xl font-black mb-1">{config?.kitchenHeader || "COMANDA"}</h2>
            {config?.kitchenShowOrderNumber && (
              <p className="text-sm font-bold">#TPV-373612</p>
            )}
            {config?.kitchenShowTime && (
              <p className="text-sm">10:25 p.m.</p>
            )}
            {config?.kitchenShowType && (
              <p className="text-sm">Comer aquí</p>
            )}
            {config?.kitchenShowTable && (
              <p className="text-sm">Mesa 4</p>
            )}
            {config?.kitchenShowCustomer && (
              <p className="text-sm">Juan Pérez</p>
            )}

            <hr className="w-full border-t border-dashed border-black my-2" />

            <div className="w-full text-left">
              {config?.kitchenGroupBySeat ? (
                <>
                  <p className="font-bold">COMENSAL 1</p>
                  <p className="font-black">1x Tacos al pastor</p>
                  {config?.kitchenShowModifiers && <p className="pl-3 text-xs">+ Salsa verde</p>}
                  <br />
                  <p className="font-bold">COMENSAL 2</p>
                  <p className="font-black">1x Quesadilla</p>
                  {config?.kitchenShowNotes && <p className="pl-3 text-xs">&gt; sin cebolla</p>}
                  <br />
                  <p className="font-bold">COMPARTIDO</p>
                  <p className="font-black">2x Refrescos</p>
                </>
              ) : (
                <>
                  <p className="font-black">1x Tacos al pastor</p>
                  {config?.kitchenShowModifiers && <p className="pl-3 text-xs">+ Salsa verde</p>}
                  <p className="font-black">1x Quesadilla</p>
                  {config?.kitchenShowNotes && <p className="pl-3 text-xs">&gt; sin cebolla</p>}
                  <p className="font-black">2x Refrescos</p>
                </>
              )}
            </div>

            <hr className="w-full border-t border-dashed border-black my-2" />

            {config?.kitchenFooter?.trim() && (
              <p className="text-xs italic">{config.kitchenFooter}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
