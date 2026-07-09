"use client";
import { Download, Users } from "lucide-react";
import { Card, DataCard, SectionLabel, Pill, Avatar, Button } from "@/components/ds";
import { formatMoney } from "@/lib/format";
import { PERMS, PAY_LABELS, roleMeta, initials, mxToday } from "./shared";

const mny = (n: number) => formatMoney(n ?? 0, false);

export function EmployeeDetail({
  emp, shifts, loadingShifts,
  activity, loadingActivity,
  activityDate, onActivityDate,
  exportFrom, setExportFrom, exportTo, setExportTo,
  exporting, onExportActivity,
}: {
  emp: any;
  shifts: any[];
  loadingShifts: boolean;
  activity: any;
  loadingActivity: boolean;
  activityDate: string;
  onActivityDate: (date: string) => void;
  exportFrom: string; setExportFrom: (v: string) => void;
  exportTo: string; setExportTo: (v: string) => void;
  exporting: boolean;
  onExportActivity: () => void;
}) {
  function formatDur(start: string, end: string | null) {
    if (!end) return "En turno";
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  }

  const role = roleMeta(emp.role);
  const RoleIcon = role?.icon ?? Users;

  const isDelivery = emp.role === "DELIVERY";
  const sum = activity?.orderSummary;
  const orders: any[] = activity?.orders ?? [];
  const cashShifts: any[] = activity?.cashShifts ?? [];
  const fmtTime = (d: string) =>
    new Date(d).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Mexico_City" });

  return (
    <div className="max-w-2xl">
      <Card className="mb-4 p-6">
        <div className="mb-4 flex items-center gap-4">
          {emp.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emp.photo} alt="" className="h-20 w-20 rounded-ds-lg object-cover" />
          ) : (
            <Avatar initials={initials(emp.name)} size={80} />
          )}
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-extrabold text-tx-hi">{emp.name}</h2>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-tx-mid">
              <RoleIcon size={14} /> {role?.label}
            </div>
            {emp.phone && <p className="text-sm text-tx-mut">{emp.phone}</p>}
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <Card className="p-3" style={{ background: "var(--surf-2)" }}>
            <div className="text-[11px] text-tx-mut">Turnos este mes</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-primary">
              {shifts.filter((s) => new Date(s.startAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}
            </div>
          </Card>
          <Card className="p-3" style={{ background: "var(--surf-2)" }}>
            <div className="text-[11px] text-tx-mut">Horas este mes</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-primary">
              {shifts.filter((s) => s.endAt && new Date(s.startAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
                .reduce((acc, s) => acc + (new Date(s.endAt).getTime() - new Date(s.startAt).getTime()) / 3600000, 0).toFixed(1)}h
            </div>
          </Card>
        </div>

        <SectionLabel>Permisos</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {PERMS.map((p) => {
            const on = emp[p.key];
            return (
              <span
                key={p.key}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: on ? "var(--ok-soft)" : "var(--surf-2)",
                  color: on ? "var(--ok)" : "var(--tx-mut)",
                  border: `1px solid ${on ? "transparent" : "var(--bd-1)"}`,
                }}
              >
                <p.icon size={12} /> {p.label}
              </span>
            );
          })}
        </div>
      </Card>

      {/* ── Actividad del día (según rol) ─────────────────────────── */}
      <Card className="mb-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
          style={{ background: "var(--surf-2)", borderBottom: "1px solid var(--bd-1)" }}>
          <span className="font-display font-bold text-tx-hi">
            {isDelivery ? "Entregas del día" : "Pedidos tomados"}
          </span>
          <input
            type="date" value={activityDate} max={mxToday()}
            onChange={(e) => onActivityDate(e.target.value)}
            className="rounded-ds-md px-3 py-1.5 text-xs outline-none"
            style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }}
          />
        </div>

        {loadingActivity ? (
          <div className="py-8 text-center text-sm text-tx-mut">Cargando actividad…</div>
        ) : (
          <div className="p-4">
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Card className="p-3" style={{ background: "var(--surf-2)" }}>
                <div className="text-[11px] text-tx-mut">{isDelivery ? "Entregas" : "Pedidos"}</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{sum?.count ?? 0}</div>
              </Card>
              <Card className="p-3" style={{ background: "var(--surf-2)" }}>
                <div className="text-[11px] text-tx-mut">Total vendido</div>
                <div className="mt-1 font-display text-2xl font-extrabold text-primary">{mny(sum?.total ?? 0)}</div>
              </Card>
              {Boolean(sum?.cancelled) && (
                <Card className="p-3" style={{ background: "var(--surf-2)" }}>
                  <div className="text-[11px] text-tx-mut">Anulados</div>
                  <div className="mt-1 font-display text-2xl font-extrabold" style={{ color: "var(--err)" }}>{sum.cancelled}</div>
                </Card>
              )}
            </div>

            {sum && Object.keys(sum.byMethod || {}).length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {Object.entries(sum.byMethod as Record<string, number>).map(([k, v]) => (
                  <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                    style={{ background: "var(--surf-2)", color: "var(--tx-mid)", border: "1px solid var(--bd-1)" }}>
                    {PAY_LABELS[k] || k}: <b className="text-tx-hi">{mny(v)}</b>
                  </span>
                ))}
              </div>
            )}

            {orders.length === 0 ? (
              <div className="rounded-ds-lg py-8 text-center text-xs text-tx-mut" style={{ border: "1px dashed var(--bd-1)" }}>
                {!isDelivery && (emp.role === "WAITER" || emp.role === "CASHIER")
                  ? "Sin pedidos atribuidos este día. La atribución por empleado empezó a registrarse en esta versión: los pedidos anteriores no la tienen."
                  : isDelivery
                    ? "Sin entregas asignadas este día."
                    : "Sin pedidos tomados este día."}
              </div>
            ) : (
              <div className="overflow-hidden rounded-ds-lg" style={{ border: "1px solid var(--bd-1)" }}>
                {orders.map((o, i) => {
                  const cancelled = o.status === "CANCELLED";
                  const cashDue = (o.paymentMethod === "CASH" || o.paymentMethod === "CASH_ON_DELIVERY") && !o.cashCollected && !cancelled;
                  return (
                    <div key={o.id} className="flex items-center justify-between gap-3 px-4 py-2.5"
                      style={{ borderTop: i ? "1px solid var(--bd-1)" : undefined, opacity: cancelled ? 0.5 : 1 }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-medium text-tx">
                          <span className="font-mono text-[11px] text-tx-mut">{fmtTime(o.createdAt)}</span>
                          <span className="truncate">{o.customer || "Público general"}</span>
                          {cancelled && <Pill tone="err">Anulado</Pill>}
                          {cashDue && <Pill tone="warn">Efectivo pend.</Pill>}
                        </div>
                        <div className="text-[11px] text-tx-mut">
                          {o.orderNumber} · {PAY_LABELS[o.paymentMethod] || o.paymentMethod}
                        </div>
                      </div>
                      <div className="shrink-0 font-display text-sm font-extrabold text-primary"
                        style={cancelled ? { textDecoration: "line-through" } : undefined}>
                        {mny(o.total || 0)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {cashShifts.length > 0 && (
              <div className="mt-4">
                <SectionLabel>Turnos de caja</SectionLabel>
                <div className="flex flex-col gap-2">
                  {cashShifts.map((cs) => (
                    <Card key={cs.id} className="p-3" style={{ background: "var(--surf-2)" }}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-tx">
                          {fmtTime(cs.openedAt)}{cs.closedAt ? ` → ${fmtTime(cs.closedAt)}` : ""}
                        </span>
                        {cs.isOpen ? <Pill tone="ok" live>Abierto</Pill> : <Pill tone="neutral">Cerrado</Pill>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-tx-mut">
                        <span>Efectivo <b className="text-tx-hi">{mny(cs.totalCash || 0)}</b></span>
                        <span>Tarjeta <b className="text-tx-hi">{mny(cs.totalCard || 0)}</b></span>
                        <span>Transfer. <b className="text-tx-hi">{mny(cs.totalTransfer || 0)}</b></span>
                        {Boolean(cs.totalExpenses) && <span>Gastos <b style={{ color: "var(--err)" }}>{mny(cs.totalExpenses)}</b></span>}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-end gap-2 rounded-ds-lg p-3"
              style={{ background: "var(--surf-2)", border: "1px solid var(--bd-1)" }}>
              <div className="min-w-0">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">Exportar CSV · desde</div>
                <input type="date" value={exportFrom} max={mxToday()}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="rounded-ds-md px-3 py-1.5 text-xs outline-none"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
              </div>
              <div className="min-w-0">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-[.14em] text-tx-mut">hasta</div>
                <input type="date" value={exportTo} max={mxToday()}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="rounded-ds-md px-3 py-1.5 text-xs outline-none"
                  style={{ background: "var(--surf-1)", border: "1px solid var(--bd-1)", color: "var(--tx)" }} />
              </div>
              <Button icon={Download} onClick={onExportActivity} disabled={exporting}>
                {exporting ? "Generando…" : "Exportar"}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <DataCard title="Historial de turnos" bodyClassName="p-0">
        {loadingShifts ? (
          <div className="py-8 text-center text-sm text-tx-mut">Cargando...</div>
        ) : shifts.length === 0 ? (
          <div className="py-8 text-center text-sm text-tx-mut">Sin turnos registrados</div>
        ) : shifts.map((shift: any) => (
          <div key={shift.id} className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid var(--bd-1)" }}>
            <div>
              <div className="text-sm font-medium text-tx">{new Date(shift.startAt).toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", weekday: "short", day: "numeric", month: "short" })}</div>
              <div className="text-[11px] text-tx-mut">
                {new Date(shift.startAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}
                {shift.endAt && ` → ${new Date(shift.endAt).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit" })}`}
              </div>
            </div>
            {shift.endAt ? (
              <Pill tone="neutral">{formatDur(shift.startAt, shift.endAt)}</Pill>
            ) : (
              <Pill tone="ok" live>En turno</Pill>
            )}
          </div>
        ))}
      </DataCard>
    </div>
  );
}
