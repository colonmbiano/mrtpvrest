"use client";
import { useEffect, useState } from "react";
import api from "@/lib/api";

export default function CajaRepartidoresPage() {
  const [summary, setSummary]   = useState<any[]>([]);
  const [cuts, setCuts]         = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [movSummary, setMovSummary] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [cuttingId, setCuttingId] = useState<string|null>(null);
  const [cutNotes, setCutNotes] = useState("");
  const [showCutModal, setShowCutModal] = useState<any>(null);
  const [showFloatModal, setShowFloatModal] = useState<any>(null);
  const [floatAmount, setFloatAmount] = useState("");
  const [floatBusy, setFloatBusy] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [s, c, r] = await Promise.all([
        api.get("/api/driver-cash/summary/today"),
        api.get("/api/driver-cash/cuts"),
        api.get("/api/driver-cash/shift-requests"),
      ]);
      setSummary(s.data);
      setCuts(c.data);
      setRequests(r.data);
    } catch {} finally { setLoading(false); }
  }

  async function fetchDriverMovements(driverId: string) {
    try {
      const { data } = await api.get(`/api/driver-cash/${driverId}/movements`);
      setMovements(data.movements || []);
      setMovSummary(data.summary || {});
    } catch {}
  }

  async function fetchRequests() {
    try {
      const { data } = await api.get("/api/driver-cash/shift-requests");
      setRequests(data);
    } catch {}
  }

  useEffect(() => {
    fetchAll();
    // Sondeo ligero: el repartidor avisa el cierre desde su app y aquí aparece
    // sin tener que refrescar la página manualmente.
    const t = setInterval(fetchRequests, 20000);
    return () => clearInterval(t);
  }, []);

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

  async function doAssignFloat(driver: any) {
    const n = Number(floatAmount);
    if (!(n > 0)) return;
    setFloatBusy(true);
    try {
      await api.post(`/api/driver-cash/${driver.id}/float`, { amount: n });
      setShowFloatModal(null); setFloatAmount("");
      fetchAll();
      alert(`✅ Fondo de cambio asignado a ${driver.name}: $${n.toFixed(0)}`);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setFloatBusy(false); }
  }

  const totalIncome  = summary.reduce((s, d) => s + d.income, 0);
  const totalExpense = summary.reduce((s, d) => s + d.expense, 0);
  const totalBalance = summary.reduce((s, d) => s + ((d.float || 0) + d.income - d.expense - (d.returned || 0)), 0);

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

      {/* Solicitudes de cierre de turno (repartidor → admin) */}
      {requests.length > 0 && (
        <div className="rounded-2xl border overflow-hidden mb-6" style={{borderColor:"rgba(245,166,35,0.4)",background:"rgba(245,166,35,0.06)"}}>
          <div className="px-5 py-3 border-b font-syne font-bold flex items-center gap-2"
            style={{borderColor:"rgba(245,166,35,0.2)",color:"var(--gold)"}}>
            🔔 Solicitudes de cierre de turno
            <span className="text-xs px-2 py-0.5 rounded-full" style={{background:"var(--gold)",color:"#000"}}>{requests.length}</span>
          </div>
          {requests.map((r: any) => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3 border-b" style={{borderColor:"rgba(245,166,35,0.15)"}}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0" style={{background:"var(--surf2)"}}>🛵</div>
              <div className="flex-1">
                <div className="font-bold text-sm">{r.driverName}</div>
                <div className="text-xs" style={{color:"var(--muted)"}}>
                  Solicitó cerrar turno · {new Date(r.createdAt).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}
                </div>
              </div>
              <div className="text-right mr-2">
                <div className="text-xs" style={{color:"var(--muted)"}}>Efectivo en mano</div>
                <div className="font-black" style={{color:"var(--gold)"}}>${(r.balance||0).toFixed(0)}</div>
              </div>
              <button onClick={() => setShowCutModal({ id: r.driverId, name: r.driverName })}
                className="py-2 px-4 rounded-xl text-xs font-bold flex-shrink-0"
                style={{background:"var(--gold)",color:"#000"}}>
                ✂️ Hacer corte
              </button>
            </div>
          ))}
        </div>
      )}

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
            <div className="grid grid-cols-4 divide-x border-t" style={{borderColor:"var(--border)"}}>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Fondo</div>
                <div className="font-black text-sm" style={{color:"#a78bfa"}}>${(d.float || 0).toFixed(0)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Cobrado</div>
                <div className="font-black text-sm" style={{color:"#22c55e"}}>${d.income.toFixed(0)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>Gastos</div>
                <div className="font-black text-sm" style={{color:"#ef4444"}}>${d.expense.toFixed(0)}</div>
              </div>
              <div className="p-3 text-center">
                <div className="text-xs mb-0.5" style={{color:"var(--muted)"}}>En mano</div>
                <div className="font-black text-sm" style={{color:"var(--gold)"}}>${((d.float || 0) + d.income - d.expense - (d.returned || 0)).toFixed(0)}</div>
              </div>
            </div>
            <div className="flex gap-2 p-3 border-t" style={{borderColor:"var(--border)"}}>
              <button onClick={async () => { setSelected(d); await fetchDriverMovements(d.driver.id); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>
                📋 Movimientos
              </button>
              <button onClick={() => { setFloatAmount(""); setShowFloatModal(d.driver); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:"rgba(167,139,250,0.1)",color:"#a78bfa",border:"1px solid rgba(167,139,250,0.2)"}}>
                💵 Asignar cambio
              </button>
              <button onClick={() => setShowCutModal(d.driver)}
                className="flex-1 py-2 rounded-xl text-xs font-bold"
                style={{background:"rgba(245,166,35,0.1)",color:"var(--gold)",border:"1px solid rgba(245,166,35,0.2)"}}>
                ✂️ Corte
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
                style={{background: m.type==="FLOAT" ? "rgba(167,139,250,0.1)" : (m.type==="INCOME" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)")}}>
                {m.type === "FLOAT" ? "💵" : m.category === "DELIVERY" ? "🛵" : m.category === "GASOLINE" ? "⛽" : m.category === "EMERGENCY_PURCHASE" ? "🛒" : m.category === "RETIRO" ? "📤" : "📝"}
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
                style={{color: m.type==="FLOAT" ? "#a78bfa" : (m.type==="INCOME" ? "#22c55e" : "#ef4444")}}>
                {(m.type==="INCOME" || m.type==="FLOAT") ? "+" : "-"}${m.amount.toFixed(0)}
              </div>
            </div>
          ))}
          {movSummary && (
            <div className="grid grid-cols-4 divide-x border-t px-0" style={{borderColor:"var(--border)",background:"var(--surf2)"}}>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Fondo</div>
                <div className="font-black" style={{color:"#a78bfa"}}>${(movSummary.float||0).toFixed(0)}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Total cobrado</div>
                <div className="font-black" style={{color:"#22c55e"}}>${(movSummary.income||0).toFixed(0)}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>Total gastos</div>
                <div className="font-black" style={{color:"#ef4444"}}>${(movSummary.expense||0).toFixed(0)}</div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xs mb-1" style={{color:"var(--muted)"}}>En mano</div>
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
                {(cut.totalFloat > 0) && <div className="text-xs" style={{color:"#a78bfa"}}>fondo ${cut.totalFloat.toFixed(0)}</div>}
                <div className="text-xs" style={{color:"#22c55e"}}>+${cut.totalIncome.toFixed(0)}</div>
                <div className="text-xs" style={{color:"#ef4444"}}>-${cut.totalExpense.toFixed(0)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal asignar fondo de cambio */}
      {showFloatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.85)"}}>
          <div className="w-full max-w-sm rounded-2xl border p-6" style={{background:"var(--surf)",borderColor:"var(--border)"}}>
            <h3 className="font-syne font-black text-xl mb-1">💵 Asignar cambio</h3>
            <p className="text-sm mb-4" style={{color:"var(--muted)"}}>
              Fondo de caja para <b>{showFloatModal.name}</b>. Suma a su efectivo en mano para dar cambio y cubrir compras; no cuenta como venta.
            </p>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-2xl" style={{color:"#a78bfa"}}>$</span>
              <input type="number" inputMode="decimal" autoFocus value={floatAmount}
                onChange={e => setFloatAmount(e.target.value)} placeholder="0"
                className="w-full h-16 rounded-xl outline-none pl-9 pr-4 font-black text-2xl"
                style={{background:"var(--surf2)",border:"1px solid var(--border)",color:"var(--text)"}} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setShowFloatModal(null); setFloatAmount(""); }} disabled={floatBusy}
                className="flex-1 py-3 rounded-xl font-bold border"
                style={{borderColor:"var(--border)",color:"var(--muted)"}}>Cancelar</button>
              <button onClick={() => doAssignFloat(showFloatModal)} disabled={floatBusy || !(Number(floatAmount) > 0)}
                className="flex-1 py-3 rounded-xl font-syne font-black"
                style={{background:"#a78bfa",color:"#000"}}>
                {floatBusy ? "..." : "Asignar"}
              </button>
            </div>
          </div>
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
