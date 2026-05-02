"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

type Movement = {
  id: string;
  type: "INCOME" | "EXPENSE" | "RETURN";
  category: string;
  amount: number;
  description: string | null;
  createdAt: string;
};

type Props = {
  driver: { id: string; name: string } | null;
  onClose: () => void;
  onRefresh: () => void;
  accent: string;
};

export default function DriverMovementsModal({ driver, onClose, onRefresh, accent }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  // Form state
  const [type, setType] = useState<"INCOME" | "EXPENSE" | "RETURN">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("OTROS");

  const categories = [
    { value: "FUEL", label: "⛽ Gasolina" },
    { value: "REPAIR", label: "🔧 Reparación" },
    { value: "FOOD", label: "🍲 Comida" },
    { value: "OTHER", label: "📝 Otros" },
    { value: "INCIDENT", label: "⚠️ Incidencia" },
  ];

  async function fetchMovements() {
    if (!driver) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/api/driver-cash/${driver.id}/movements`);
      setMovements(data.movements);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (driver) fetchMovements();
  }, [driver]);

  async function handleAddMovement(e: React.FormEvent) {
    e.preventDefault();
    if (!driver || !amount || isNaN(Number(amount))) return;

    try {
      setAdding(true);
      await api.post(`/api/driver-cash/${driver.id}/movements`, {
        type,
        category,
        amount: Number(amount),
        description,
      });
      setAmount("");
      setDescription("");
      fetchMovements();
      onRefresh();
    } catch {
      alert("Error al registrar movimiento");
    } finally {
      setAdding(false);
    }
  }

  if (!driver) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative w-full max-w-lg bg-[var(--surf)] border border-[var(--border)] rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
      >
        <div className="p-6 border-b border-[var(--border)] flex justify-between items-center bg-[var(--bg)]">
          <div>
            <h2 className="text-xl font-black text-white">💰 Movimientos de Caja</h2>
            <p className="text-xs font-bold" style={{ color: accent }}>{driver.name}</p>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-white text-2xl">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Formulario */}
          <form onSubmit={handleAddMovement} className="space-y-4 bg-[var(--surf2)] p-4 rounded-2xl border border-[var(--border)]">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Registrar Nuevo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--muted)] uppercase ml-1">Tipo</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as any)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  <option value="EXPENSE">🔻 Gasto / Salida</option>
                  <option value="INCOME">🔺 Ingreso / Entrada</option>
                  <option value="RETURN">🔄 Devolución</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-[var(--muted)] uppercase ml-1">Categoría</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                >
                  {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-1 space-y-1">
                <label className="text-[10px] font-bold text-[var(--muted)] uppercase ml-1">Monto ($)</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                  required
                />
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-[10px] font-bold text-[var(--muted)] uppercase ml-1">Descripción / Incidencia</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ej: Gasolina, Ponchadura..."
                  className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm text-white outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={adding}
              className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-widest text-black transition-transform active:scale-95 disabled:opacity-50"
              style={{ background: accent }}
            >
              {adding ? "Registrando..." : "Guardar Movimiento"}
            </button>
          </form>

          {/* Lista de Movimientos */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 ml-1">Historial de Hoy</h3>
            {loading ? (
              <p className="text-sm text-[var(--muted)] animate-pulse">Cargando movimientos...</p>
            ) : movements.length === 0 ? (
              <p className="text-sm text-[var(--muted)] italic">No hay movimientos registrados hoy.</p>
            ) : (
              <div className="space-y-2">
                {movements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-[var(--surf2)] border border-[var(--border)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${
                        m.type === 'INCOME' ? 'bg-green-500/10 text-green-400' :
                        m.type === 'EXPENSE' ? 'bg-red-500/10 text-red-400' :
                        'bg-blue-500/10 text-blue-400'
                      }`}>
                        {m.type === 'INCOME' ? '↑' : m.type === 'EXPENSE' ? '↓' : '↺'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white">{m.description || m.category}</div>
                        <div className="text-[10px] text-[var(--muted)]">{new Date(m.createdAt).toLocaleTimeString()}</div>
                      </div>
                    </div>
                    <div className={`text-sm font-black ${
                      m.type === 'INCOME' ? 'text-green-400' :
                      m.type === 'EXPENSE' ? 'text-red-400' :
                      'text-blue-400'
                    }`}>
                      {m.type === 'EXPENSE' ? '-' : ''}${m.amount.toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-[var(--border)] bg-[var(--bg)] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl text-xs font-bold text-[var(--muted)] hover:text-white transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
