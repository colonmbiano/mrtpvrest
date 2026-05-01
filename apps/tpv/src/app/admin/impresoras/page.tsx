"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";

type Printer = {
  id: string;
  name: string;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH";
  ip?: string | null;
  type: string;
};

export default function ImpresorasPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<Partial<Printer>>({
    name: "",
    connectionType: "NETWORK",
    ip: "",
    type: "RECEIPT",
  });

  useEffect(() => {
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    setLoading(true);
    try {
      // The API endpoint should match the backend router for printers
      const { data } = await api.get("/api/admin/printers");
      setPrinters(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setPrinters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/api/admin/printers/${editingId}`, form);
      } else {
        await api.post("/api/admin/printers", form);
      }
      setIsFormOpen(false);
      setEditingId(null);
      setForm({ name: "", connectionType: "NETWORK", ip: "", type: "RECEIPT" });
      fetchPrinters();
    } catch (err) {
      alert("Error guardando impresora");
    }
  };

  const handleEdit = (p: Printer) => {
    setForm(p);
    setEditingId(p.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar impresora?")) return;
    try {
      await api.delete(`/api/admin/printers/${id}`);
      fetchPrinters();
    } catch (e) {
      alert("Error eliminando impresora");
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-black mb-2">Gestión de Impresoras</h1>
          <p className="text-gray-400">Configura impresoras térmicas para recibos y KDS.</p>
        </div>
        <button
          onClick={() => {
            setForm({ name: "", connectionType: "NETWORK", ip: "", type: "RECEIPT" });
            setEditingId(null);
            setIsFormOpen(true);
          }}
          className="bg-[#ffb84d] text-black px-5 py-2.5 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95"
        >
          + Nueva Impresora
        </button>
      </div>

      {isFormOpen && (
        <form onSubmit={handleSave} className="bg-[#141417] p-6 rounded-2xl border border-[#2d2d30] mb-8">
          <h2 className="text-xl font-bold mb-4" style={{ color: "#ffb84d" }}>
            {editingId ? "Editar Impresora" : "Nueva Impresora"}
          </h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Nombre</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                placeholder="Ej. Barra 1"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Rol / Tipo</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              >
                <option value="RECEIPT">Recibos / Caja</option>
                <option value="KITCHEN">Cocina</option>
                <option value="BAR">Barra</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-1">Conexión</label>
              <select
                value={form.connectionType}
                onChange={(e) => setForm({ ...form, connectionType: e.target.value as any })}
                className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
              >
                <option value="NETWORK">Red (IP/WiFi)</option>
                <option value="USB">USB</option>
                <option value="BLUETOOTH">Bluetooth</option>
              </select>
            </div>
            {form.connectionType === "NETWORK" && (
              <div>
                <label className="block text-sm font-bold text-gray-400 mb-1">Dirección IP</label>
                <input
                  value={form.ip || ""}
                  onChange={(e) => setForm({ ...form, ip: e.target.value })}
                  className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                  placeholder="192.168.1.x"
                />
              </div>
            )}
          </div>
          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-[#ffb84d] text-black px-5 py-2 rounded-xl font-bold"
            >
              Guardar
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando impresoras...</div>
      ) : printers.length === 0 ? (
        <div className="bg-[#141417] p-10 rounded-2xl border border-[#2d2d30] text-center text-gray-400">
          No hay impresoras configuradas.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {printers.map((p) => (
            <div key={p.id} className="bg-[#141417] p-5 rounded-2xl border border-[#2d2d30] flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-white">{p.name}</h3>
                  <span className="bg-[#ffb84d]/10 text-[#ffb84d] text-[10px] font-black uppercase px-2 py-1 rounded">
                    {p.type}
                  </span>
                </div>
                <div className="text-sm text-gray-400 mb-4">
                  {p.connectionType === "NETWORK" ? `IP: ${p.ip}` : p.connectionType}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(p)}
                  className="flex-1 bg-[#2d2d30] hover:bg-gray-600 text-white py-1.5 rounded-lg text-xs font-bold transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 py-1.5 rounded-lg text-xs font-bold transition-colors"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
