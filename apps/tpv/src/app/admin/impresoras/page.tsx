"use client";
import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Monitor, Printer as PrinterIcon, Network, Usb, Bluetooth, Trash2, Edit3, Plus } from "lucide-react";
import KDSConfigModal from "@/components/pos/KDSConfigModal";
import BackButton from "@/components/BackButton";
import { printTestTicket, type PrinterStation } from "@/lib/printer-tcp";

type Printer = {
  id: string;
  name: string;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH";
  ip?: string | null;
  port?: number | null;
  type: string;
  isVirtual?: boolean;
};

const DEFAULT_FORM: Partial<Printer> = {
  name: "",
  connectionType: "NETWORK",
  ip: "",
  port: 9100,
  type: "CASHIER",
};

export default function ImpresorasPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isKDSModalOpen, setIsKDSModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<Partial<Printer>>(DEFAULT_FORM);

  useEffect(() => {
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/printers");
      setPrinters(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (data: Partial<Printer>) => {
    if (saving) return;
    setSaving(true);
    const loadingToastId = toast.loading(editingId ? "Actualizando dispositivo…" : "Guardando dispositivo…");
    try {
      const payload = {
        ...data,
        port: data.port ? parseInt(String(data.port), 10) || 9100 : 9100,
      };
      if (editingId) {
        await api.put(`/api/printers/${editingId}`, payload, { timeout: 20000 });
        toast.success("Dispositivo actualizado", { id: loadingToastId });
      } else {
        await api.post("/api/printers", payload, { timeout: 20000 });
        toast.success("Dispositivo creado", { id: loadingToastId });
      }
      setIsFormOpen(false);
      setIsKDSModalOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      fetchPrinters();
      // Avisa a SidebarTicket (POS) que refresque su cache de impresoras.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("printers-changed"));
      }
    } catch (err: any) {
      const code = err?.code;
      const serverMsg = err?.response?.data?.error;
      const msg =
        code === "ECONNABORTED"
          ? "Servidor no respondió a tiempo. Reintenta en unos segundos."
          : serverMsg || err?.message || "fallo desconocido";
      toast.error("Error guardando: " + msg, { id: loadingToastId });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (p: Printer) => {
    setEditingId(p.id);
    if (p.isVirtual || p.ip === "0.0.0.0") {
      setForm(p);
      setIsKDSModalOpen(true);
    } else {
      setForm({ ...DEFAULT_FORM, ...p });
      setIsFormOpen(true);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este dispositivo?")) return;
    try {
      await api.delete(`/api/printers/${id}`);
      toast.success("Dispositivo eliminado");
      fetchPrinters();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("printers-changed"));
      }
    } catch {
      toast.error("Error eliminando dispositivo");
    }
  };

  const handleTest = async (id: string) => {
    const printer = printers.find((p) => p.id === id);
    if (!printer) {
      toast.error("Impresora no encontrada");
      return;
    }
    if (printer.isVirtual || printer.ip === "0.0.0.0") {
      toast.success("Refrescando pantalla KDS…");
      // KDS virtual no requiere ESC/POS — el server hace push vía socket.
      return;
    }
    if (printer.connectionType !== "NETWORK") {
      toast.error(`Conexión ${printer.connectionType} no soportada todavía`);
      return;
    }
    if (!printer.ip) {
      toast.error("Impresora NETWORK sin IP configurada");
      return;
    }

    setTestingId(id);
    toast.success("Enviando impresión de prueba...");
    try {
      // Imprimir directo desde la tablet vía TCP nativo (Capacitor plugin).
      // El backend Railway no puede alcanzar IPs LAN del cliente, así que
      // la impresión real ocurre acá en la misma red de la impresora.
      await printTestTicket(
        { ip: printer.ip, port: printer.port },
        (printer.type as PrinterStation) || "KITCHEN"
      );
      toast.success("Prueba enviada correctamente al dispositivo");
    } catch (err) {
      const e = err as { message?: string };
      toast.error("Error en prueba: " + (e?.message || "fallo TCP"));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto min-h-screen font-sans">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-10">
        <div className="flex items-start gap-4">
          <BackButton ariaLabel="Volver al panel admin" />
          <div>
            <span className="text-[10px] font-black tracking-[0.2em] uppercase text-zinc-500 block mb-2">Infraestructura</span>
            <h1 className="text-3xl font-black text-white tracking-tight mb-1">Red e Impresoras</h1>
            <p className="text-sm text-zinc-400 font-medium">Gestiona tus impresoras físicas y estaciones KDS virtuales.</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setForm({ name: "", connectionType: "NETWORK", ip: "", type: "KITCHEN" });
              setEditingId(null);
              setIsKDSModalOpen(true);
            }}
            className="flex items-center gap-2 bg-[#121316] border border-white/5 text-zinc-300 px-5 py-3 rounded-2xl font-bold transition-all hover:bg-[#1a1b1f] active:scale-95"
          >
            <Monitor size={18} className="text-amber-500" /> + Nuevo KDS
          </button>
          <button
            onClick={() => {
              setForm(DEFAULT_FORM);
              setEditingId(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
          >
            <Plus size={18} /> Nueva Impresora
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
        <StatCard label="Dispositivos" value={printers.length} sub="En línea" icon={<Network size={20} />} color="amber" />
        <StatCard label="Estaciones" value={new Set(printers.map(p => p.type)).size} sub="Activas" icon={<PrinterIcon size={20} />} color="blue" />
        <StatCard label="Pantallas" value={printers.filter(p => p.ip === "0.0.0.0" || p.isVirtual).length} sub="KDS Cloud" icon={<Monitor size={20} />} color="emerald" />
      </div>

      {/* FORMULARIO TRADICIONAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSave(form); }} 
            className="w-full max-w-lg bg-[#0a0a0c] p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6"
          >
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                {editingId ? "Editar Impresora" : "Nueva Impresora"}
              </h2>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">Hardware Físico</p>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Nombre</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                  placeholder="Ej. Comandas Cocina"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Rol</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none"
                  >
                    <option value="CASHIER">Caja / Recibos</option>
                    <option value="KITCHEN">Cocina</option>
                    <option value="BAR">Barra / Drinks</option>
                    <option value="GRILL">Plancha</option>
                    <option value="FRYER">Freidora</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Conexión</label>
                  <select
                    value={form.connectionType}
                    onChange={(e) => setForm({ ...form, connectionType: e.target.value as any })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none"
                  >
                    <option value="NETWORK">Ethernet / WiFi</option>
                    <option value="USB">USB Local</option>
                    <option value="BLUETOOTH">Bluetooth</option>
                  </select>
                </div>
              </div>

              {form.connectionType === "NETWORK" && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 space-y-1.5">
                    <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Dirección IP</label>
                    <input
                      required
                      value={form.ip || ""}
                      onChange={(e) => setForm({ ...form, ip: e.target.value })}
                      className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                      placeholder="192.168.1..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Puerto</label>
                    <input
                      type="number"
                      value={form.port ?? 9100}
                      onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 9100 })}
                      className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Botón Test de Impresión (solo en edición — necesita id existente) */}
            {editingId && (
              <button
                type="button"
                onClick={() => handleTest(editingId)}
                disabled={testingId === editingId}
                className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-amber-500 border border-amber-500/30 font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-50"
              >
                {testingId === editingId ? "Enviando…" : "🖨️ Test de Impresión"}
              </button>
            )}

            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                disabled={saving}
                className="flex-1 h-14 rounded-2xl bg-zinc-900 text-zinc-400 font-bold hover:text-white disabled:opacity-40"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-[2] h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-4 h-4 border-2 border-[#0a0a0c]/30 border-t-[#0a0a0c] rounded-full animate-spin" />
                    Guardando…
                  </>
                ) : editingId ? "Guardar cambios" : "Guardar Dispositivo"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KDS MODAL */}
      <KDSConfigModal 
        isOpen={isKDSModalOpen}
        onClose={() => { setIsKDSModalOpen(false); setEditingId(null); setForm(DEFAULT_FORM); }}
        onSave={handleSave}
        initialData={form}
      />

      {/* GRID DISPOSITIVOS */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Sincronizando dispositivos...</span>
        </div>
      ) : printers.length === 0 ? (
        <div className="bg-[#121316] rounded-[2.5rem] p-20 border border-white/5 text-center">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
            <PrinterIcon size={40} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Sin hardware configurado</h3>
          <p className="text-zinc-500 max-w-xs mx-auto text-sm font-medium">Empieza agregando una impresora de tickets o una pantalla KDS para cocina.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {printers.map((p) => {
            const isKDS = p.isVirtual || p.ip === "0.0.0.0";
            return (
              <div key={p.id} className="group relative bg-[#121316] p-6 rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all hover:shadow-2xl hover:shadow-amber-500/5">
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isKDS ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {isKDS ? <Monitor size={24} /> : <PrinterIcon size={24} />}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl ${isKDS ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {p.type}
                  </span>
                </div>

                <div className="mb-8">
                  <h3 className="text-lg font-black text-white tracking-tight mb-1">{p.name}</h3>
                  <div className="flex items-center gap-2 text-zinc-500 text-xs font-bold">
                    {p.connectionType === "NETWORK" ? (
                      <>
                        <Network size={14} className="text-zinc-600" />
                        <span>{isKDS ? "Virtual / Cloud" : p.ip}</span>
                      </>
                    ) : p.connectionType === "USB" ? (
                      <>
                        <Usb size={14} className="text-zinc-600" />
                        <span>USB Local</span>
                      </>
                    ) : (
                      <>
                        <Bluetooth size={14} className="text-zinc-600" />
                        <span>Bluetooth</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => handleTest(p.id)}
                    disabled={testingId === p.id}
                    className="w-full h-12 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {testingId === p.id ? "Conectando..." : isKDS ? "Refrescar Pantalla" : "Test de Impresión"}
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(p)}
                      className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-xl flex items-center justify-center transition-all"
                    >
                      <Edit3 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex-1 h-12 bg-red-500/5 hover:bg-red-500/10 text-red-500/50 hover:text-red-500 rounded-xl flex items-center justify-center transition-all"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon, color }: { label: string; value: number | string; sub: string; icon: React.ReactNode; color: string }) {
  const colors: Record<string, string> = {
    amber: "text-amber-500 bg-amber-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    emerald: "text-emerald-500 bg-emerald-500/10",
  };

  return (
    <div className="bg-[#121316] p-6 rounded-[2rem] border border-white/5 flex items-center gap-5">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-white tracking-tight">{value}</span>
          <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">{sub}</span>
        </div>
      </div>
    </div>
  );
}

