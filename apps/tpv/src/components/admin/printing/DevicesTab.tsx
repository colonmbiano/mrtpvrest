"use client";

/**
 * DevicesTab — alta/edición de impresoras físicas Y pantallas KDS en un
 * único formulario. Reemplaza el formulario inline de /admin/impresoras +
 * el KDSConfigModal: un toggle "Es pantalla KDS" ramifica los pocos campos
 * que difieren (estaciones vigiladas vs rol/conexión).
 */

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Monitor, Printer as PrinterIcon, Network, Usb, Bluetooth, Trash2, Edit3, Plus } from "lucide-react";
import { printTestTicket, type PrinterStation } from "@/lib/printer-tcp";
import { formatDisplayName } from "@/lib/formatDisplayName";

interface Printer {
  id: string;
  name: string;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH";
  ip?: string | null;
  port?: number | null;
  type: string;
  isVirtual?: boolean;
  stations?: string[];
  supportsCashDrawer?: boolean;
}

interface FormState {
  id?: string;
  name: string;
  isKDS: boolean;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH";
  ip: string;
  port: number;
  type: string;
  stations: string[];
  supportsCashDrawer: boolean;
}

const STATIONS: Array<{ code: string; label: string }> = [
  { code: "KITCHEN", label: "Cocina" },
  { code: "BAR", label: "Barra" },
  { code: "GRILL", label: "Plancha" },
  { code: "FRYER", label: "Freidora" },
];

const EMPTY_FORM: FormState = {
  name: "",
  isKDS: false,
  connectionType: "NETWORK",
  ip: "",
  port: 9100,
  type: "CASHIER",
  stations: STATIONS.map((s) => s.code),
  supportsCashDrawer: false,
};

const isKdsPrinter = (p: Printer) => Boolean(p.isVirtual) || p.ip === "0.0.0.0" || (p.stations?.length ?? 0) > 0;

export default function DevicesTab() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const fetchPrinters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/printers");
      setPrinters(Array.isArray(data) ? data : []);
    } catch {
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) fetchPrinters(); });
    return () => { cancelled = true; };
  }, []);

  const openNew = (kds: boolean) => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, isKDS: kds, type: kds ? "KITCHEN" : "CASHIER" });
    setIsFormOpen(true);
  };

  const openEdit = (p: Printer) => {
    const kds = isKdsPrinter(p);
    setEditingId(p.id);
    setForm({
      id: p.id,
      name: p.name,
      isKDS: kds,
      connectionType: p.connectionType || "NETWORK",
      ip: p.ip && p.ip !== "0.0.0.0" ? p.ip : "",
      port: p.port || 9100,
      type: p.type || (kds ? "KITCHEN" : "CASHIER"),
      stations: p.stations && p.stations.length > 0 ? p.stations : STATIONS.map((s) => s.code),
      supportsCashDrawer: Boolean(p.supportsCashDrawer),
    });
    setIsFormOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const tid = toast.loading(editingId ? "Actualizando dispositivo…" : "Guardando dispositivo…");
    try {
      const payload: Record<string, unknown> = form.isKDS
        ? {
            name: form.name,
            connectionType: "NETWORK",
            ip: form.ip.trim() || "0.0.0.0",
            port: form.port || 9100,
            type: form.stations[0] || "KITCHEN",
            stations: form.stations,
          }
        : {
            name: form.name,
            connectionType: form.connectionType,
            ip: form.connectionType === "NETWORK" ? form.ip.trim() : null,
            port: form.port || 9100,
            type: form.type,
            stations: [],
            supportsCashDrawer: form.type === "CASHIER" ? form.supportsCashDrawer : false,
          };

      if (editingId) {
        await api.put(`/api/printers/${editingId}`, payload, { timeout: 20000 });
        toast.success("Dispositivo actualizado", { id: tid });
      } else {
        await api.post("/api/printers", payload, { timeout: 20000 });
        toast.success("Dispositivo creado", { id: tid });
      }
      setIsFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchPrinters();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("printers-changed"));
    } catch (err: unknown) {
      const e = err as { code?: string; response?: { data?: { error?: string } }; message?: string };
      const msg =
        e?.code === "ECONNABORTED"
          ? "Servidor no respondió a tiempo. Reintenta."
          : e?.response?.data?.error || e?.message || "fallo";
      toast.error("Error: " + msg, { id: tid });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este dispositivo?")) return;
    try {
      await api.delete(`/api/printers/${id}`);
      toast.success("Dispositivo eliminado");
      fetchPrinters();
      if (typeof window !== "undefined") window.dispatchEvent(new Event("printers-changed"));
    } catch {
      toast.error("Error eliminando dispositivo");
    }
  };

  const handleTest = async (p: Printer) => {
    if (isKdsPrinter(p) && (!p.ip || p.ip === "0.0.0.0")) {
      toast.success("KDS virtual: recibe por socket, no requiere prueba TCP.");
      return;
    }
    if (p.connectionType !== "NETWORK") {
      toast.error(`Conexión ${p.connectionType} no soportada todavía`);
      return;
    }
    if (!p.ip) {
      toast.error("Dispositivo NETWORK sin IP configurada");
      return;
    }
    setTestingId(p.id);
    toast.success("Enviando impresión de prueba...");
    try {
      await printTestTicket({ ip: p.ip, port: p.port }, (p.type as PrinterStation) || "KITCHEN");
      toast.success("Prueba enviada correctamente");
    } catch (err) {
      const e = err as { message?: string };
      toast.error("Error en prueba: " + (e?.message || "fallo TCP"));
    } finally {
      setTestingId(null);
    }
  };

  const toggleStation = (code: string) => {
    setForm((f) => {
      const has = f.stations.includes(code);
      const next = has ? f.stations.filter((c) => c !== code) : [...f.stations, code];
      return { ...f, stations: next.length === 0 ? f.stations : next };
    });
  };

  return (
    <div>
      <div className="flex justify-end gap-3 mb-6">
        <button
          onClick={() => openNew(true)}
          className="flex items-center gap-2 bg-[#121316] border border-white/5 text-zinc-300 px-5 py-3 rounded-2xl font-bold transition-all hover:bg-[#1a1b1f] active:scale-95"
        >
          <Monitor size={18} className="text-amber-500" /> + Nuevo KDS
        </button>
        <button
          onClick={() => openNew(false)}
          className="flex items-center gap-2 bg-amber-500 text-[#0a0a0c] px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs transition-all hover:scale-105 active:scale-95 shadow-lg shadow-amber-500/20"
        >
          <Plus size={18} /> Nueva Impresora
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-12 h-12 border-4 border-amber-500/20 border-t-amber-500 rounded-full animate-spin" />
          <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">Sincronizando…</span>
        </div>
      ) : printers.length === 0 ? (
        <div className="bg-[#121316] rounded-[2.5rem] p-20 border border-white/5 text-center">
          <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-6 text-zinc-700">
            <PrinterIcon size={40} />
          </div>
          <h3 className="text-xl font-black text-white mb-2">Sin hardware configurado</h3>
          <p className="text-zinc-500 max-w-xs mx-auto text-sm font-medium">Agrega una impresora de tickets o una pantalla KDS para cocina.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {printers.map((p) => {
            const kds = isKdsPrinter(p);
            return (
              <div key={p.id} className="group relative bg-[#121316] p-6 rounded-[2rem] border border-white/5 hover:border-amber-500/30 transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${kds ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {kds ? <Monitor size={24} /> : <PrinterIcon size={24} />}
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl ${kds ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"}`}>
                    {kds && p.stations && p.stations.length > 0 ? p.stations.join(" · ") : p.type}
                  </span>
                </div>
                <div className="mb-8">
                  <h3 className="text-lg font-black text-white tracking-tight mb-1">{formatDisplayName(p.name)}</h3>
                  <div className="flex items-center gap-2 text-zinc-500 text-xs font-bold">
                    {p.connectionType === "NETWORK" ? (
                      <><Network size={14} className="text-zinc-600" /><span>{kds && (!p.ip || p.ip === "0.0.0.0") ? "Virtual / Cloud" : p.ip}</span></>
                    ) : p.connectionType === "USB" ? (
                      <><Usb size={14} className="text-zinc-600" /><span>USB Local</span></>
                    ) : (
                      <><Bluetooth size={14} className="text-zinc-600" /><span>Bluetooth</span></>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => handleTest(p)}
                    disabled={testingId === p.id}
                    className="w-full h-12 bg-white/5 hover:bg-white/10 text-zinc-300 rounded-xl text-xs font-black uppercase tracking-widest transition-all disabled:opacity-50"
                  >
                    {testingId === p.id ? "Conectando..." : kds && (!p.ip || p.ip === "0.0.0.0") ? "KDS por socket" : "Test de Impresión"}
                  </button>
                  <div className="flex gap-2">
                    <button onClick={() => openEdit(p)} className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 rounded-xl flex items-center justify-center transition-all">
                      <Edit3 size={18} />
                    </button>
                    <button onClick={() => handleDelete(p.id)} className="flex-1 h-12 bg-red-500/5 hover:bg-red-500/10 text-red-500/50 hover:text-red-500 rounded-xl flex items-center justify-center transition-all">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <form onSubmit={handleSave} className="w-full max-w-lg bg-[#0a0a0c] p-8 rounded-[2rem] border border-white/10 shadow-2xl space-y-6 max-h-[92vh] overflow-y-auto scrollbar-hide">
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight mb-1">
                {editingId ? "Editar dispositivo" : form.isKDS ? "Nueva pantalla KDS" : "Nueva impresora"}
              </h2>
              <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">{form.isKDS ? "Pantalla de cocina · TCP/Socket" : "Hardware físico"}</p>
            </div>

            {/* Toggle KDS / Impresora */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setForm({ ...form, isKDS: false, type: "CASHIER" })}
                className="flex flex-col items-start gap-1 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{ background: !form.isKDS ? "rgba(255,184,77,0.10)" : "#121316", borderColor: !form.isKDS ? "#ffb84d" : "rgba(255,255,255,0.05)" }}>
                <span className="text-sm font-black text-white">Impresora física</span>
                <span className="text-[10px] font-bold text-zinc-500">Térmica ESC/POS</span>
              </button>
              <button type="button" onClick={() => setForm({ ...form, isKDS: true, type: "KITCHEN" })}
                className="flex flex-col items-start gap-1 p-4 rounded-2xl border transition-all active:scale-95 text-left"
                style={{ background: form.isKDS ? "rgba(255,184,77,0.10)" : "#121316", borderColor: form.isKDS ? "#ffb84d" : "rgba(255,255,255,0.05)" }}>
                <span className="text-sm font-black text-white">Pantalla KDS</span>
                <span className="text-[10px] font-bold text-zinc-500">Tablet de cocina</span>
              </button>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Nombre</label>
              <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                placeholder={form.isKDS ? "Ej. KDS Parrilla" : "Ej. Comandas Cocina"} />
            </div>

            {!form.isKDS && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Rol</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none">
                    <option value="CASHIER">Caja / Recibos</option>
                    <option value="KITCHEN">Cocina</option>
                    <option value="BAR">Barra / Drinks</option>
                    <option value="GRILL">Plancha</option>
                    <option value="FRYER">Freidora</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Conexión</label>
                  <select value={form.connectionType} onChange={(e) => setForm({ ...form, connectionType: e.target.value as FormState["connectionType"] })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500 appearance-none">
                    <option value="NETWORK">Ethernet / WiFi</option>
                    <option value="USB">USB Local</option>
                    <option value="BLUETOOTH">Bluetooth</option>
                  </select>
                </div>
              </div>
            )}

            {form.isKDS && (
              <div className="space-y-2.5">
                <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Estaciones que vigila</label>
                <div className="grid grid-cols-2 gap-2">
                  {STATIONS.map((s) => {
                    const active = form.stations.includes(s.code);
                    return (
                      <button key={s.code} type="button" onClick={() => toggleStation(s.code)}
                        className="flex items-center gap-3 p-3 rounded-xl border transition-all active:scale-95"
                        style={{ background: active ? "rgba(255,184,77,0.10)" : "#121316", borderColor: active ? "#ffb84d" : "rgba(255,255,255,0.05)" }}>
                        <span className="w-3 h-3 rounded-full" style={{ background: active ? "#ffb84d" : "rgba(255,255,255,0.10)" }} />
                        <span className="text-sm font-black text-white">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {(form.isKDS || form.connectionType === "NETWORK") && (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">
                    {form.isKDS ? "IP local de la tablet" : "Dirección IP"}
                  </label>
                  <input value={form.ip} onChange={(e) => setForm({ ...form, ip: e.target.value })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500"
                    placeholder={form.isKDS ? "192.168.1.x (vacío = solo socket)" : "192.168.1..."} required={!form.isKDS} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black text-zinc-500 uppercase tracking-wider ml-1">Puerto</label>
                  <input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 9100 })}
                    className="w-full h-14 bg-[#121316] border border-white/5 rounded-2xl px-5 text-white font-bold focus:outline-none focus:border-amber-500" />
                </div>
              </div>
            )}

            {!form.isKDS && form.type === "CASHIER" && (
              <button type="button" onClick={() => setForm({ ...form, supportsCashDrawer: !form.supportsCashDrawer })}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#121316] border border-white/5">
                <span className="text-sm font-bold text-zinc-300">Cajón de dinero conectado</span>
                <div className={`w-11 h-6 rounded-full relative transition-colors ${form.supportsCashDrawer ? "bg-amber-500" : "bg-zinc-700"}`}>
                  <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${form.supportsCashDrawer ? "right-1" : "left-1"}`} />
                </div>
              </button>
            )}

            {editingId && (
              <button type="button" onClick={() => { const p = printers.find((x) => x.id === editingId); if (p) handleTest(p); }}
                disabled={testingId === editingId}
                className="w-full h-12 rounded-2xl bg-white/5 hover:bg-white/10 text-amber-500 border border-amber-500/30 font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-50">
                {testingId === editingId ? "Enviando…" : "🖨️ Test de Impresión"}
              </button>
            )}

            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setIsFormOpen(false)} disabled={saving} className="flex-1 h-14 rounded-2xl bg-zinc-900 text-zinc-400 font-bold hover:text-white disabled:opacity-40">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className="flex-[2] h-14 rounded-2xl bg-amber-500 text-[#0a0a0c] font-black uppercase tracking-widest text-xs active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
