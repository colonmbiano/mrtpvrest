import React, { useState, useEffect } from "react";
import { get, set } from "idb-keyval";
import { Printer, X, Plus, Trash, Wifi, Bluetooth, Usb, Play } from "lucide-react";
import { toast } from "sonner";
import { isValidIPv4, printTestTicket, type PrinterRecord, type PrinterStation } from "../lib/printer-tcp";
import { normalizePrinters } from "../lib/tokki-printers";
import { usePrinters } from "../hooks/usePrinters";

export default function PrinterSettingsModal({ onClose }: { onClose: () => void }) {
  const [printers, setPrinters] = useState<PrinterRecord[]>([]);
  const { printers: allPrinters } = usePrinters();
  const adminPrinters = allPrinters.filter(p => !printers.some(local => local.id === p.id || (local.ip && local.ip === p.ip && local.port === p.port)));
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [type, setType] = useState("TCP");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("9100");
  const [macAddress, setMacAddress] = useState("");
  const [station, setStation] = useState("ALL");

  useEffect(() => {
    get<Array<PrinterRecord & { macAddress?: string }>>("tokki-printers").then((val) => {
      if (val) setPrinters(normalizePrinters(val));
    }).catch(() => toast.error("No se pudo leer la configuración de impresoras."));
  }, []);

  const savePrinters = async (newPrinters: PrinterRecord[]) => {
    await set("tokki-printers", newPrinters);
    setPrinters(newPrinters);
    window.dispatchEvent(new Event("tokki-printers-changed"));
  };

  const handleAdd = async () => {
    if (saving) return;
    if (!name.trim()) return toast.error("Ingresa un nombre");
    if (type === "TCP" && (!ip || !port)) return toast.error("Ingresa IP y Puerto");
    if (type === "TCP" && (!isValidIPv4(ip.trim()) || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535)) return toast.error("Revisa la dirección IP y el puerto (1 a 65535).");
    if (type === "BLUETOOTH" && !macAddress) return toast.error("Ingresa la MAC Address");
    
    const newPrinter = {
      id: Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      type: station === "ALL" ? "CASHIER" : station,
      connectionType: type === "TCP" ? "NETWORK" : type,
      ip: type === "TCP" ? ip.trim() : null,
      port: type === "TCP" ? Number(port) : null,
      macAddress,
      isActive: true,
      stations: station === "ALL" ? ["CASHIER", "BAR", "KITCHEN"] : [station],
    };
    
    setSaving(true);
    try {
    await savePrinters([...printers, newPrinter]);
    setShowAdd(false);
    setName("");
    setIp("");
    setMacAddress("");
    toast.success("Impresora guardada localmente");
    } catch { toast.error("No se pudo guardar la impresora. Intenta nuevamente."); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("¿Quitar esta impresora de la tablet?")) return;
    try { await savePrinters(printers.filter(p => p.id !== id)); }
    catch { toast.error("No se pudo quitar la impresora."); }
  };

  const changeUse = async (id: string, value: string) => {
    setSaving(true);
    try { await savePrinters(printers.map(p => p.id === id ? { ...p, type: value === "ALL" ? "CASHIER" : value, stations: value === "ALL" ? ["CASHIER", "BAR", "KITCHEN"] : [value] } : p)); toast.success("Uso de impresora actualizado"); }
    catch { toast.error("No se pudo guardar el cambio."); }
    finally { setSaving(false); }
  };
  const testPrinter = async (p: PrinterRecord) => {
    if (testing) return;
    setTesting(p.id);
    try { await printTestTicket({ ip: p.ip!, port: p.port! }, p.type as PrinterStation); toast.success("Prueba enviada. Confirma que salió en papel."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo imprimir"); }
    finally { setTesting(null); }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="printers-title" className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white text-gray-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-700">
              <Printer size={20} />
            </div>
            <h2 id="printers-title" className="text-xl font-black text-gray-800">Impresoras Locales</h2>
          </div>
          <button onClick={onClose} disabled={saving} aria-label="Cerrar impresoras" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <X size={24} className="text-gray-500" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-3">Para recibir pedidos usa “Recibos y comandas”. Con una sola impresora de red, Tokki también envía las comandas a esa impresora. La tablet y la impresora deben estar en la misma red.</p>
        <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
          {printers.length === 0 && adminPrinters.length === 0 && !showAdd && (
            <div className="text-center py-8 text-gray-400 font-medium bg-gray-50 rounded-2xl border border-dashed border-gray-200">
              No hay impresoras locales configuradas
            </div>
          )}

          {printers.map(p => (
            <div key={p.id} className="p-4 bg-white border border-gray-200 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  p.connectionType === 'NETWORK' ? 'bg-blue-50 text-blue-600' : 
                  p.connectionType === 'BLUETOOTH' ? 'bg-purple-50 text-purple-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  {p.connectionType === 'NETWORK' ? <Wifi size={24} /> : 
                   p.connectionType === 'BLUETOOTH' ? <Bluetooth size={24} /> : <Usb size={24} />}
                </div>
                <div>
                  <div className="font-bold text-gray-800">{p.name}</div>
                  <select aria-label={`Uso de ${p.name}`} disabled={saving || !!testing} value={(p.stations?.length || 0) > 1 ? "ALL" : p.stations?.[0] || p.type} onChange={e => void changeUse(p.id, e.target.value)} className="w-full min-h-11 mt-1 rounded-lg border border-gray-200 text-sm"><option value="ALL">Recibos y comandas</option><option value="CASHIER">Solo recibos</option><option value="BAR">Barra</option><option value="KITCHEN">Cocina</option></select>
                  <div className="text-sm font-semibold text-gray-500 mt-0.5">
                    {p.connectionType === 'NETWORK' ? `${p.ip}:${p.port} · ${p.type}` : `${p.connectionType} · ${p.type}`}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                {p.connectionType === "NETWORK" && <button disabled={!!testing || saving} onClick={() => void testPrinter(p)} className="p-3 text-purple-500 hover:bg-purple-50 rounded-xl" aria-label={`Probar ${p.name}`}>{testing === p.id ? "…" : <Play size={18} />}</button>}
                <button onClick={() => handleDelete(p.id)} className="p-3 text-red-400 hover:bg-red-50 rounded-xl transition-colors" aria-label={`Eliminar ${p.name}`}><Trash size={18} /></button>
              </div>
            </div>
          ))}

          {adminPrinters.map(p => <div key={p.id} className="p-4 border border-purple-200 rounded-2xl bg-purple-50"><b>{p.name}</b><p className="text-sm">Registrada en admin · {p.ip}:{p.port} · {(p.stations?.length ? p.stations : [p.type]).join(' / ')}</p><div className="flex gap-2 mt-2">{p.connectionType === "NETWORK" && <button disabled={!!testing} className="p-3 rounded-xl bg-white" onClick={() => void testPrinter(p)}>Probar</button>}<button disabled={saving} className="p-3 rounded-xl bg-white" onClick={() => { setSaving(true); void savePrinters([...printers, { ...p, type: 'CASHIER', stations: ['CASHIER', 'BAR', 'KITCHEN'] }]).catch(() => toast.error('No se pudo guardar.')).finally(() => setSaving(false)); }}>Usar para recibos y comandas</button></div></div>)}

          {showAdd && (
            <div className="p-5 bg-gray-50 border border-gray-200 rounded-2xl mt-2 animate-in fade-in slide-in-from-top-4 duration-200">
              <h3 className="font-bold text-gray-800 mb-4">Nueva Impresora</h3>
              
              <div className="flex gap-2 mb-4">
                <button onClick={() => setType("TCP")} className={`flex-1 py-2 rounded-xl font-bold text-sm transition-colors ${type === 'TCP' ? 'bg-white shadow border border-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100'}`}>Red / WiFi</button>
                <button disabled title="Disponible al integrar una impresora Bluetooth compatible" className="flex-1 py-2 rounded-xl font-bold text-sm text-gray-500">Bluetooth</button>
                <button disabled title="Disponible al integrar una impresora USB compatible" className="flex-1 py-2 rounded-xl font-bold text-sm text-gray-500">USB</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 ml-1">Uso de la impresora</label>
                  <select value={station} onChange={(event) => setStation(event.target.value)} className="w-full mt-1 p-3 rounded-xl border-none ring-1 ring-gray-200 bg-white outline-none">
                    <option value="ALL">Recibos y comandas</option><option value="CASHIER">Recibos de caja</option><option value="BAR">Barra</option><option value="KITCHEN">Cocina</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 ml-1">Nombre (Ej. Barra, Cocina)</label>
                  <input value={name} onChange={e => setName(e.target.value)} type="text" className="w-full mt-1 p-3 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-[#FFCDD2] outline-none" placeholder="Caja Principal" />
                </div>
                
                {type === "TCP" && (
                  <div className="flex gap-3">
                    <div className="flex-[2]">
                      <label className="text-xs font-bold text-gray-500 ml-1">Dirección IP</label>
                      <input value={ip} onChange={e => setIp(e.target.value)} type="text" className="w-full mt-1 p-3 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-[#FFCDD2] outline-none" placeholder="192.168.1.100" />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs font-bold text-gray-500 ml-1">Puerto</label>
                      <input value={port} onChange={e => setPort(e.target.value)} type="text" className="w-full mt-1 p-3 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-[#FFCDD2] outline-none" placeholder="9100" />
                    </div>
                  </div>
                )}

                {type === "BLUETOOTH" && (
                  <div>
                    <label className="text-xs font-bold text-gray-500 ml-1">MAC Address</label>
                    <input value={macAddress} onChange={e => setMacAddress(e.target.value)} type="text" className="w-full mt-1 p-3 rounded-xl border-none ring-1 ring-gray-200 focus:ring-2 focus:ring-[#FFCDD2] outline-none" placeholder="00:11:22:33:44:55" />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button disabled={saving} onClick={() => setShowAdd(false)} className="flex-1 py-3 bg-gray-200 text-gray-700 font-bold rounded-xl active:scale-95 transition-transform">Cancelar</button>
                <button disabled={saving} onClick={handleAdd} className="flex-1 py-3 bg-gray-800 text-white font-bold rounded-xl active:scale-95 transition-transform">{saving ? "Guardando…" : "Guardar"}</button>
              </div>
            </div>
          )}
        </div>

        {!showAdd && (
          <button 
            onClick={() => setShowAdd(true)}
            className="w-full mt-4 py-4 border-2 border-dashed border-gray-200 hover:border-gray-300 text-gray-600 font-bold rounded-2xl flex items-center justify-center gap-2 transition-colors active:scale-95"
          >
            <Plus size={20} />
            Agregar Impresora Local
          </button>
        )}
      </div>
    </div>
  );
}
