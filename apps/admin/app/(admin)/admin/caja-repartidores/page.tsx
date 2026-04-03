"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function CajaRepartidoresPage() {
  const [summary, setSummary]   = useState<any[]>([]);
  const [cuts, setCuts]         = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [movSummary, setMovSummary] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [cuttingId, setCuttingId] = useState<string|null>(null);
  const [cutNotes, setCutNotes] = useState("");
  const [showCutModal, setShowCutModal] = useState<any>(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([
        api.get("/api/driver-cash/summary/today"),
        api.get("/api/driver-cash/cuts"),
      ]);
      setSummary(s.data);
      setCuts(c.data);
    } catch {} finally { setLoading(false); }
  }

  async function fetchDriverMovements(driverId: string) {
    try {
      const { data } = await api.get(`/api/driver-cash/${driverId}/movements`);
      setMovements(data.movements || []);
      setMovSummary(data.summary || {});
    } catch {}
  }

  useEffect(() => { fetchAll(); }, []);

  async function doCut(driver: any) {
    setCuttingId(driver.id);
    try {
      await api.post(`/api/driver-cash/${driver.id}/cut`, { notes: cutNotes });
      setShowCutModal(null); setCutNotes("");
      fetchAll();
      alert(`✅ Corte de caja realizado para ${driver.name}`);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setCuttingId(null); }
  }

  const totalIncome  = summary.reduce((s, d) => s + d.income, 0);
  const totalExpense = summary.reduce((s, d) => s + d.expense, 0);
  const totalBalance = summary.reduce((s, d) => s + (d.income - d.expense), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-syne text-3xl font-black">Caja Repartidores</h1>
          <p className="text-sm mt-1" style={{color:"var(--muted)"}}>Control de efectivo en tiempo real</p>
        </div>
        <button onClick={fetchAll} className="px-4 py-2 rounded-xl text-sm font-bold border"
          style={{borderColor:"var(--border)",color:"var(--muted)"}}>🔄 Actualizar</button>
      </div>

      {/* Resumen global */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl p-5" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
          <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Total cobrado hoy</div>
          <div className="text-3xl font-black" style={{color:"#22c55e"}}>${totalIncome.toFixed(0)}</div>
        </div>
        <div className="rounded-2xl p-5" style={{background:"var(--surf)",border:"1px solid var(--border)"}}>
          <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Total gastos</div>
          <div className="text-3xl font-black" style={{color:"#ef4444"}}>${totalExpense.toFixed(0)}</div>
        </div>
        <div className="rounded-2xl p-5" style={{background:"var(--surf)",border:"2px solid var(--gold)"}}>
          <div className="text-xs font-bold mb-1" style={{color:"var(--muted)"}}>Balance neto</div>
          <div className="text-3xl font-black" style={{color:"var(--gold)"}}>${totalBalance.toFixed(0)}</div>
        </div>
      </div>

      {/* Tarjetas por repartidor */}
      <div className="grid gap-4 mb-8" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))"}}>
        {loading ? (
          <div className="text-center py-12 col-span-full" style={{color:"var(--muted)"}}>Cargando...</div>
        ) : summary.length === 0 ? (
          <div className="text-center py-12 col-span-full" style={{color:"var(--muted)"}}>No hay repartidores activos hoy</div>
        ) : summary.map((d: any) => (
          <div key={d.driver.id} className="rounded-2xl border overflow-hidden"
            style={{background:"var(--surf)",borderColor: selected?.driver?.id===d.driver.id ? "var(--gold)" : "var(--border)"}}>
            <div className="p-4 flex items-center gap-3">
              {d.driver.photo
                ? <img src={d.driver.photo} alt="" className="w-12 h-12 rounded-full object-cover" />
                : <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{background:"var(--surf2)"}}>🛵</div>
              }
              <div className="flex-1">
                <div className="font-syne font-black">{d.driver.name}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>{d.deliveries} entregas</div>
              </div>
            </div>
            <div className="grid grid-cols-3 divide-x border-t" style={{borderColor:"var(--border)"}}>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Cobrado</div>
                <div className="font-black text-sm" style={{color:"#22c55e"}}>${d.income.toFixed(0)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Gastos</div>
                <div className="font-black text-sm" style={{color:"#ef4444"}}>${d.expense.toFixed(0)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Balance</div>
                <div className="font-black text-sm" style={{color:"var(--gold)"}}>${(d.income - d.expense).toFixed(0)}</div>
              </div>
            </div>
            <div className="flex gap-2 p-3 border-t" style={{borderColor:"var(--border)"}}>
              <button onClick={async () => { setSelected(d); await fetchDriverMovements(d.driver.id); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                📋 Ver movimientos
              </button>
              <button onClick={() => setShowCutModal(d.driver)}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)",border:"1px solid rgba(245,166,35,0.2)"}}>
                ✂️ Corte de caja
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Movimientos del repartidor seleccionado */}
      {selected && (
        <div className="rounded-2xl border overflow-hidden mb-8" style={{borderColor:"var(--border)"}}>
          <div className="px-5 py-3 border-b flex items-center justify-between" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
            <h2 className="font-syne font-bold">Movimientos — {selected.driver.name}</h2>
            <button onClick={() => setSelected(null)} className="text-xs" style={{color:"var(--muted)"}}>✕ Cerrar</button>
          </div>
          {movements.length === 0 ? (
            <div className="text-center py-8 text-sm" style={{color:"var(--muted)"}}>Sin movimientos hoy</div>
          ) : movements.map((m: any) => (
            <div key={m.id} className="flex items-center gap-4 px-5 py-3 border-b" style={{borderColor:"var(--border)",background:"var(--surf)"}}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                style={{background: m.type==="INCOME" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)"}}>
                {m.category === "DELIVERY" ? "🛵" : m.category === "GASOLINE" ? "⛽" : m.category === "EMERGENCY_PURCHASE" ? "🛒" : "📝"}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{m.description || m.category}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  {new Date(m.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                  {m.approved && <span className="ml-2 text-green-500">✓ Aprobado</span>}
                </div>
              </div>
              {m.photoUrl && (
                <a href={m.photoUrl} target="_blank" rel="noreferrer"
                  className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border"
                  style={{borderColor:"var(--border)"}}>
                  <img src={m.photoUrl} alt="ticket" className="w-full h-full object-cover" />
                </a>
              )}
              <div className="font-black text-lg flex-shrink-0"
                style={{color: m.type==="INCOME" ? "#22c55e" : "#ef4444"}}>
                {m.type === "INCOME" ? "+" : "-"}${m.amount.toFixed(0)}
              </div>
            </div>
          ))}
          {movSummary && (
            <div className="grid grid-cols-3 divide-x border-t px-0" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Total cobrado</div>
                <div className="font-black" style={{color:"#22c55e"}}>${(movSummary.income||0).toFixed(0)}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Total gastos</div>
                <div className="font-black" style={{color:"#ef4444"}}>${(movSummary.expense||0).toFixed(0)}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Balance</div>
                <div className="font-black" style={{color:"var(--gold)"}}>${(movSummary.balance||0).toFixed(0)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historial de cortes */}
      {cuts.length > 0 && (
        <div className="rounded-2xl border overflow-hidden" style={{borderColor:"var(--border)"}}>
          <div className="px-5 py-3 border-b font-syne font-bold" style={{background:"var(--surf2)",borderColor:"var(--border)"}}>
            Historial de cortes
          </div>
          {cuts.slice(0,10).map((cut: any) => (
            <div key={cut.id} className="flex items-center gap-4 px-5 py-3 border-b" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
              <div className="flex-1">
                <div className="font-bold text-sm">{cut.driverName}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  {new Date(cut.createdAt).toLocaleDateString('es-MX',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                  {" · "}{cut.movements} movimientos
                </div>
                {cut.notes && <div className="text-xs mt-0.5" style={{color:"var(--gold)"}}>{cut.notes}</div>}
              </div>
              <div className="text-right">
                <div className="font-black" style={{color:"var(--gold)"}}>${cut.balance.toFixed(0)}</div>
                <div className="text-xs" style={{color:"#22c55e"}}>+${cut.totalIncome.toFixed(0)}</div>
                <div className="text-xs" style={{color:"#ef4444"}}>-${cut.totalExpense.toFixed(0)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal corte de caja */}
      {showCutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-xl mb-1">✂️ Corte de caja</h3>
            <p className="text-sm mb-4" style={{color:"var(--muted)"}}>{showCutModal.name}</p>
            <textarea value={cutNotes} onChange={e => setCutNotes(e.target.value)}
              placeholder="Notas del corte (opcional)"
              rows={3}
              className="w-full px-4 py-3 rounded-xl text-sm outline-none resize-none mb-4"
              style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            <div className="flex gap-3">
              <button onClick={() => { setShowCutModal(null); setCutNotes(""); }}
                className="flex-1 py-3 rounded-xl font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => doCut(showCutModal)} disabled={cuttingId === showCutModal.id}
                className="flex-1 py-3 rounded-xl font-syne font-black"
                style={{background:"var(--gold)",color:"#000"}}>
                {cuttingId === showCutModal.id ? "..." : "Confirmar corte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
