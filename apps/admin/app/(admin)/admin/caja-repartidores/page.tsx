"use client";
import { useEffect, useState } from "react";
import {
  RotateCw, BellRing, Scissors, Bike, ListChecks, Banknote, X,
  TrendingUp, TrendingDown, Fuel, ShoppingCart, ArrowUpRight, StickyNote,
  CheckCircle2, Wallet, type LucideIcon,
} from "lucide-react";
import api from "@/lib/api";
import {
  WtScreen, PageHeader, WtCard, StatTile, Pill, IconBadge, Avatar,
  PrimaryBtn, EmptyState,
} from "@/components/warmtech";

export default function CajaRepartidoresPage() {
  const [summary, setSummary]   = useState<any[]>([]);
  const [cuts, setCuts]         = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [pending, setPending]   = useState<any[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [movements, setMovements] = useState<any[]>([]);
  const [movSummary, setMovSummary] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [cuttingId, setCuttingId] = useState<string | null>(null);
  const [cutNotes, setCutNotes] = useState("");
  const [showCutModal, setShowCutModal] = useState<any>(null);
  const [showFloatModal, setShowFloatModal] = useState<any>(null);
  const [floatAmount, setFloatAmount] = useState("");
  const [floatBusy, setFloatBusy] = useState(false);

  async function fetchAll() {
    setLoading(true);
    try {
      const [s, c, r, p] = await Promise.all([
        api.get("/api/driver-cash/summary/today"),
        api.get("/api/driver-cash/cuts"),
        api.get("/api/driver-cash/shift-requests"),
        api.get("/api/driver-cash/pending-collection"),
      ]);
      setSummary(s.data);
      setCuts(c.data);
      setRequests(r.data);
      setPending(p.data);
    } catch {} finally { setLoading(false); }
  }

  async function fetchPending() {
    try {
      const { data } = await api.get("/api/driver-cash/pending-collection");
      setPending(data);
    } catch {}
  }

  async function doConfirmCash(order: any) {
    setConfirmingId(order.id);
    try {
      await api.put(`/api/orders/${order.id}/confirm-cash`);
      setPending((prev) => prev.filter((o) => o.id !== order.id));
      fetchAll();
    } catch (err: any) { alert(err.response?.data?.error || "Error al confirmar el cobro"); }
    finally { setConfirmingId(null); }
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
    // Sondeo ligero: el repartidor avisa el cierre y marca entregas desde su
    // app, y aquí aparecen sin tener que refrescar la página manualmente.
    const t = setInterval(() => { fetchRequests(); fetchPending(); }, 20000);
    return () => clearInterval(t);
  }, []);

  async function doCut(driver: any) {
    setCuttingId(driver.id);
    try {
      await api.post(`/api/driver-cash/${driver.id}/cut`, { notes: cutNotes });
      setShowCutModal(null); setCutNotes("");
      fetchAll();
      alert(`Corte de caja realizado para ${driver.name}`);
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
      alert(`Fondo de cambio asignado a ${driver.name}: $${n.toFixed(0)}`);
    } catch (err: any) { alert(err.response?.data?.error || "Error"); }
    finally { setFloatBusy(false); }
  }

  const totalIncome  = summary.reduce((s, d) => s + d.income, 0);
  const totalExpense = summary.reduce((s, d) => s + d.expense, 0);
  const totalBalance = summary.reduce((s, d) => s + ((d.float || 0) + d.income - d.expense - (d.returned || 0)), 0);

  function initials(name: string) {
    return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  }

  function movementIcon(m: any): LucideIcon {
    if (m.type === "FLOAT") return Banknote;
    if (m.category === "DELIVERY") return Bike;
    if (m.category === "GASOLINE") return Fuel;
    if (m.category === "EMERGENCY_PURCHASE") return ShoppingCart;
    if (m.category === "RETIRO") return ArrowUpRight;
    return StickyNote;
  }

  return (
    <WtScreen>
      <PageHeader
        eyebrow="Caja & Turnos"
        title="Caja Repartidores"
        subtitle="Control de efectivo en tiempo real"
        actions={
          <PrimaryBtn ghost full={false} icon={RotateCw} onClick={fetchAll}>
            Actualizar
          </PrimaryBtn>
        }
      />

      {/* mobile actions */}
      <div className="mb-4 md:hidden">
        <PrimaryBtn ghost icon={RotateCw} onClick={fetchAll}>Actualizar</PrimaryBtn>
      </div>

      {/* solicitudes de cierre de turno (repartidor → admin) */}
      {requests.length > 0 && (
        <WtCard className="mb-6 overflow-hidden" style={{ borderColor: "var(--warn)" }}>
          <div className="flex items-center gap-2 px-5 py-3 font-display font-bold" style={{ borderBottom: "1px solid var(--bd-1)", background: "var(--warn-soft)", color: "var(--warn)" }}>
            <BellRing size={16} /> Solicitudes de cierre de turno
            <Pill tone="warn">{requests.length}</Pill>
          </div>
          {requests.map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <IconBadge icon={Bike} tone="warn" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-tx">{r.driverName}</div>
                <div className="text-[11px] text-tx-mut">
                  Solicitó cerrar turno · {new Date(r.createdAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <div className="text-[10px] text-tx-mut">Efectivo en mano</div>
                <div className="font-display font-extrabold text-primary">${(r.balance || 0).toFixed(0)}</div>
              </div>
              <PrimaryBtn full={false} icon={Scissors} onClick={() => setShowCutModal({ id: r.driverId, name: r.driverName })}>
                Hacer corte
              </PrimaryBtn>
            </div>
          ))}
        </WtCard>
      )}

      {/* pendientes de cobro: entregas sin pago confirmado (efectivo en mano
          del repartidor o "por cobrar"). Quedan abiertas hasta que la caja
          confirme el cobro. */}
      {pending.length > 0 && (
        <WtCard className="mb-6 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 font-display font-bold text-tx-hi" style={{ borderBottom: "1px solid var(--bd-1)", background: "var(--surf-2)" }}>
            <Banknote size={16} style={{ color: "var(--brand-primary)" }} /> Pendientes de cobro
            <Pill tone="warn">{pending.length}</Pill>
            <span className="ml-auto font-display text-sm font-extrabold text-primary">
              ${pending.reduce((s, o) => s + (o.total || 0), 0).toFixed(0)}
            </span>
          </div>
          {pending.map((o: any) => (
            <div key={o.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <IconBadge icon={Bike} tone="warn" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-tx">
                  #{o.orderNumber}{o.customerName ? ` · ${o.customerName}` : ""}
                </div>
                <div className="truncate text-[11px] text-tx-mut">
                  {o.driverName ? `${o.driverName} · ` : ""}
                  {o.paymentMethod === "CASH" ? "Efectivo" : o.paymentMethod === "PENDING" ? "Por cobrar" : o.paymentMethod}
                  {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <div className="text-[10px] text-tx-mut">Total</div>
                <div className="font-display font-extrabold text-primary">${(o.total || 0).toFixed(0)}</div>
              </div>
              <PrimaryBtn
                full={false}
                icon={CheckCircle2}
                disabled={confirmingId === o.id}
                onClick={() => doConfirmCash(o)}
              >
                {confirmingId === o.id ? "..." : "Confirmar cobro"}
              </PrimaryBtn>
            </div>
          ))}
        </WtCard>
      )}

      {/* resumen global */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile icon={TrendingUp} value={`$${totalIncome.toFixed(0)}`} label="Cobrado (sin cortar)" />
        <StatTile icon={TrendingDown} value={`$${totalExpense.toFixed(0)}`} label="Total gastos" />
        <StatTile icon={Wallet} value={`$${totalBalance.toFixed(0)}`} label="Balance neto" />
      </div>

      {/* tarjetas por repartidor */}
      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}>
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-52 animate-pulse rounded-[18px] bg-surf-2" />)
        ) : summary.length === 0 ? (
          <div className="col-span-full">
            <EmptyState icon={Bike} title="Sin repartidores activos" hint="No hay repartidores con movimientos de efectivo registrados hoy." />
          </div>
        ) : summary.map((d: any) => {
          const inHand = (d.float || 0) + d.income - d.expense - (d.returned || 0);
          const isSel = selected?.driver?.id === d.driver.id;
          return (
            <WtCard key={d.driver.id} className="overflow-hidden" style={{ borderColor: isSel ? "var(--brand-primary)" : undefined }}>
              <div className="flex items-center gap-3 p-4">
                {d.driver.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.driver.photo} alt="" className="h-12 w-12 rounded-xl object-cover" />
                ) : (
                  <Avatar initials={initials(d.driver.name)} size={48} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-display font-extrabold text-tx-hi">{d.driver.name}</div>
                  <div className="text-[11px] text-tx-mut">{d.deliveries} entregas</div>
                </div>
              </div>

              <div className="grid grid-cols-4" style={{ borderTop: "1px solid var(--bd-1)" }}>
                {[
                  { label: "Fondo",   value: `$${(d.float || 0).toFixed(0)}`, color: "var(--info)" },
                  { label: "Cobrado", value: `$${d.income.toFixed(0)}`,        color: "var(--ok)"   },
                  { label: "Gastos",  value: `$${d.expense.toFixed(0)}`,       color: "var(--err)"  },
                  { label: "En mano", value: `$${inHand.toFixed(0)}`,          color: "var(--brand-primary)" },
                ].map((c, i) => (
                  <div key={c.label} className="p-3 text-center" style={i > 0 ? { borderLeft: "1px solid var(--bd-1)" } : undefined}>
                    <div className="mb-0.5 text-[10px] text-tx-mut">{c.label}</div>
                    <div className="font-display text-sm font-extrabold" style={{ color: c.color }}>{c.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 p-3" style={{ borderTop: "1px solid var(--bd-1)" }}>
                <button
                  type="button"
                  onClick={async () => { setSelected(d); await fetchDriverMovements(d.driver.id); }}
                  className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-xs font-bold text-tx-mut"
                  style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}
                >
                  <ListChecks size={14} /> Movimientos
                </button>
                <button
                  type="button"
                  onClick={() => { setFloatAmount(""); setShowFloatModal(d.driver); }}
                  aria-label="Asignar cambio"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--info-soft)", color: "var(--info)" }}
                >
                  <Banknote size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowCutModal(d.driver)}
                  aria-label="Corte"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ background: "var(--iris-soft)", color: "var(--brand-primary)" }}
                >
                  <Scissors size={15} />
                </button>
              </div>
            </WtCard>
          );
        })}
      </div>

      {/* movimientos del repartidor seleccionado */}
      {selected && (
        <WtCard className="mt-6 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3" style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
            <h2 className="font-display font-bold text-tx-hi">Movimientos — {selected.driver.name}</h2>
            <button type="button" onClick={() => setSelected(null)} aria-label="Cerrar" className="grid h-9 w-9 place-items-center rounded-xl text-tx-mut" style={{ background: "var(--surf-1)" }}>
              <X size={15} />
            </button>
          </div>
          {movements.length === 0 ? (
            <div className="py-8 text-center text-sm text-tx-mut">Sin movimientos pendientes de corte</div>
          ) : movements.map((m: any) => {
            const isCredit = m.type === "INCOME" || m.type === "FLOAT";
            const tone = m.type === "FLOAT" ? "info" : m.type === "INCOME" ? "ok" : "err";
            const color = m.type === "FLOAT" ? "var(--info)" : m.type === "INCOME" ? "var(--ok)" : "var(--err)";
            return (
              <div key={m.id} className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
                <IconBadge icon={movementIcon(m)} tone={tone} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-tx">{m.description || m.category}</div>
                  <div className="flex items-center gap-2 text-[11px] text-tx-mut">
                    {new Date(m.createdAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}
                    {m.approved && <span className="inline-flex items-center gap-1" style={{ color: "var(--ok)" }}><CheckCircle2 size={11} /> Aprobado</span>}
                  </div>
                </div>
                {m.photoUrl && (
                  <a href={m.photoUrl} target="_blank" rel="noreferrer" className="h-12 w-12 shrink-0 overflow-hidden rounded-xl" style={{ border: "1px solid var(--bd-1)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.photoUrl} alt="ticket" className="h-full w-full object-cover" />
                  </a>
                )}
                <div className="shrink-0 font-display text-lg font-extrabold" style={{ color }}>
                  {isCredit ? "+" : "-"}${m.amount.toFixed(0)}
                </div>
              </div>
            );
          })}
          {movSummary && (
            <div className="grid grid-cols-4" style={{ borderTop: "1px solid var(--bd-1)", background: "var(--surf-2)" }}>
              {[
                { label: "Fondo",         value: `$${(movSummary.float || 0).toFixed(0)}`,   color: "var(--info)" },
                { label: "Total cobrado", value: `$${(movSummary.income || 0).toFixed(0)}`,  color: "var(--ok)"   },
                { label: "Total gastos",  value: `$${(movSummary.expense || 0).toFixed(0)}`, color: "var(--err)"  },
                { label: "En mano",       value: `$${(movSummary.balance || 0).toFixed(0)}`, color: "var(--brand-primary)" },
              ].map((c, i) => (
                <div key={c.label} className="p-4 text-center" style={i > 0 ? { borderLeft: "1px solid var(--bd-1)" } : undefined}>
                  <div className="mb-1 text-[11px] text-tx-mut">{c.label}</div>
                  <div className="font-display font-extrabold" style={{ color: c.color }}>{c.value}</div>
                </div>
              ))}
            </div>
          )}
        </WtCard>
      )}

      {/* historial de cortes */}
      {cuts.length > 0 && (
        <WtCard className="mt-6 overflow-hidden">
          <div className="px-5 py-3 font-display font-bold text-tx-hi" style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
            Historial de cortes
          </div>
          {cuts.slice(0, 10).map((cut: any) => (
            <div key={cut.id} className="flex items-center gap-4 px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-tx">{cut.driverName}</div>
                <div className="text-[11px] text-tx-mut">
                  {new Date(cut.createdAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  {" · "}{cut.movements} movimientos
                </div>
                {cut.notes && <div className="mt-0.5 text-[11px] text-primary">{cut.notes}</div>}
              </div>
              <div className="shrink-0 text-right">
                <div className="font-display font-extrabold text-primary">${cut.balance.toFixed(0)}</div>
                {cut.totalFloat > 0 && <div className="text-[11px]" style={{ color: "var(--info)" }}>fondo ${cut.totalFloat.toFixed(0)}</div>}
                <div className="text-[11px]" style={{ color: "var(--ok)" }}>+${cut.totalIncome.toFixed(0)}</div>
                <div className="text-[11px]" style={{ color: "var(--err)" }}>-${cut.totalExpense.toFixed(0)}</div>
              </div>
            </div>
          ))}
        </WtCard>
      )}

      {/* modal asignar fondo de cambio */}
      {showFloatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="w-full max-w-sm p-6">
            <h3 className="mb-1 flex items-center gap-2 font-display text-xl font-extrabold text-tx-hi">
              <Banknote size={20} style={{ color: "var(--info)" }} /> Asignar cambio
            </h3>
            <p className="mb-4 text-sm text-tx-mut">
              Fondo de caja para <b className="text-tx">{showFloatModal.name}</b>. Suma a su efectivo en mano para dar cambio y cubrir compras; no cuenta como venta.
            </p>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl font-extrabold" style={{ color: "var(--info)" }}>$</span>
              <input
                type="number" inputMode="decimal" autoFocus value={floatAmount}
                onChange={(e) => setFloatAmount(e.target.value)} placeholder="0"
                className="h-16 w-full rounded-xl pl-9 pr-4 font-display text-2xl font-extrabold outline-none"
                style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
              />
            </div>
            <div className="flex gap-3">
              <PrimaryBtn ghost disabled={floatBusy} onClick={() => { setShowFloatModal(null); setFloatAmount(""); }}>Cancelar</PrimaryBtn>
              <PrimaryBtn disabled={floatBusy || !(Number(floatAmount) > 0)} onClick={() => doAssignFloat(showFloatModal)}>
                {floatBusy ? "..." : "Asignar"}
              </PrimaryBtn>
            </div>
          </WtCard>
        </div>
      )}

      {/* modal corte de caja */}
      {showCutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.8)" }}>
          <WtCard className="w-full max-w-sm p-6">
            <h3 className="mb-1 flex items-center gap-2 font-display text-xl font-extrabold text-tx-hi">
              <Scissors size={20} className="text-primary" /> Corte de caja
            </h3>
            <p className="mb-4 text-sm text-tx-mut">{showCutModal.name}</p>
            <textarea
              value={cutNotes} onChange={(e) => setCutNotes(e.target.value)}
              placeholder="Notas del corte (opcional)" rows={3}
              className="mb-4 w-full resize-none rounded-xl px-4 py-3 text-sm outline-none"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
            />
            <div className="flex gap-3">
              <PrimaryBtn ghost onClick={() => { setShowCutModal(null); setCutNotes(""); }}>Cancelar</PrimaryBtn>
              <PrimaryBtn disabled={cuttingId === showCutModal.id} onClick={() => doCut(showCutModal)}>
                {cuttingId === showCutModal.id ? "..." : "Confirmar corte"}
              </PrimaryBtn>
            </div>
          </WtCard>
        </div>
      )}
    </WtScreen>
  );
}
