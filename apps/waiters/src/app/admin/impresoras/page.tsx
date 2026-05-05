"use client";
import React, { useState, useEffect } from "react";
import api from "@/lib/api";

type Printer = {
  id: string;
  name: string;
  connectionType: "USB" | "NETWORK" | "BLUETOOTH";
  ip?: string | null;
  port?: number | null;
  type: string;
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        port: form.port ? parseInt(String(form.port), 10) || 9100 : 9100,
      };
      if (editingId) {
        await api.put(`/api/printers/${editingId}`, payload);
      } else {
        await api.post("/api/printers", payload);
      }
      setIsFormOpen(false);
      setEditingId(null);
      setForm(DEFAULT_FORM);
      fetchPrinters();
    } catch (err: any) {
      alert("Error guardando impresora: " + (err?.response?.data?.error || err?.message || ""));
    }
  };

  const handleEdit = (p: Printer) => {
    setForm({ ...DEFAULT_FORM, ...p });
    setEditingId(p.id);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar impresora?")) return;
    try {
      await api.delete(`/api/printers/${id}`);
      fetchPrinters();
    } catch {
      alert("Error eliminando impresora");
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      await api.post(`/api/printers/${id}/test`);
      alert("Prueba de impresión enviada");
    } catch (err: any) {
      alert("Error en prueba: " + (err?.response?.data?.error || err?.message || ""));
    } finally {
      setTestingId(null);
    }
  };

  // Stats agregados
  const totalCount = printers.length;
  const networkCount = printers.filter(p => p.connectionType === "NETWORK").length;
  const stationsByType = new Set(printers.map(p => p.type)).size;

  return (
    <div className="p-8 max-w-6xl mx-auto" style={{ fontFamily: "JetBrains Mono, monospace" }}>
      <div className="flex justify-between items-end mb-6">
        <div>
          <p className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>HARDWARE</p>
          <h1 className="text-2xl font-bold mb-1 text-white">Hardware e Impresoras</h1>
          <p className="text-xs" style={{ color: "#B8B9B6" }}>Dispositivos en red local · Configura recibos, KDS y barra.</p>
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

      {/* Stats row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <StatTile label="DISPOSITIVOS" value={totalCount} sub={`${networkCount} en red`} accent="#FF8400" />
        <StatTile label="ESTACIONES" value={stationsByType} sub="distintas" accent="#88D66C" />
        <StatTile label="PRÓXIMO PING" value={loading ? "—" : "auto"} sub="cada 30s" accent="#FFB84D" />
      </section>

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
                <option value="CASHIER">Recibos / Caja</option>
                <option value="KITCHEN">Cocina</option>
                <option value="BAR">Barra</option>
                <option value="FRYER">Freidora</option>
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
              <>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Dirección IP</label>
                  <input
                    value={form.ip || ""}
                    onChange={(e) => setForm({ ...form, ip: e.target.value })}
                    className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                    placeholder="192.168.1.x"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-400 mb-1">Puerto</label>
                  <input
                    type="number"
                    value={form.port ?? 9100}
                    onChange={(e) => setForm({ ...form, port: parseInt(e.target.value, 10) || 9100 })}
                    className="w-full bg-[#0a0a0c] border border-[#2d2d30] rounded-xl px-4 py-2 text-white focus:outline-none focus:border-[#ffb84d]"
                    placeholder="9100"
                  />
                </div>
              </>
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
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => handleTest(p.id)}
                  disabled={testingId === p.id}
                  className="bg-[#ffb84d]/10 hover:bg-[#ffb84d]/20 text-[#ffb84d] py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {testingId === p.id ? "Enviando…" : "Probar impresión"}
                </button>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent: string }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1"
      style={{ background: "#1A1A1A", border: "1px solid #2E2E2E" }}>
      <span className="text-[10px] font-bold tracking-wider" style={{ color: "#666" }}>{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums" style={{ color: accent }}>{value}</span>
        <span className="text-[10px]" style={{ color: "#B8B9B6" }}>{sub}</span>
      </div>
    </div>
  );
}
