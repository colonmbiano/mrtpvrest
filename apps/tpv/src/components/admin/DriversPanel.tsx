"use client";
import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Banknote,
  Bike,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import api from "@/lib/api";
import DriverMovementsModal from "./DriverMovementsModal";
import { useAuthStore, type UserRole } from "@/store/authStore";
import type { AxiosError } from "axios";

// Panel ligero de rastreo para el TPV: lista de repartidores activos con
// estado online, última actividad y ruta en curso. No incluye mapa (está en
// /admin/rastreo del backoffice). El objetivo aquí es glance-info para el
// cajero/gerente durante operación — no exploración cartográfica.

type DriverRow = {
  driver: { id: string; name: string; photo?: string | null };
  location: {
    lat: number;
    lng: number;
    createdAt: string;
  } | null;
  activeRoute: { id: string; startAt: string } | null;
  online: boolean;
  cash?: {
    float: number;
    income: number;
    expense: number;
    returned: number;
    deliveries: number;
    balance: number;
  };
};

type LiveResponse = {
  drivers: DriverRow[];
  origin: { lat: number; lng: number } | null;
};

type CashSummary = {
  driver: { id: string; name: string; photo?: string | null };
  float: number;
  income: number;
  expense: number;
  returned: number;
  deliveries: number;
};

// Pedido entregado pero sin cobro confirmado (efectivo que el repartidor aún
// trae). Espejo de la lista del admin (/api/driver-cash/pending-collection).
type PendingOrder = {
  id: string;
  orderNumber: string;
  total: number;
  paymentMethod: string | null;
  customerName: string | null;
  deliveryAddress: string | null;
  driverName: string | null;
};

type ApiError = {
  error?: string;
};

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const la1 = rad(a.lat), la2 = rad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `hace ${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.round(min / 60);
  return `hace ${hr}h`;
}

function formatDistance(m: number) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  accent: string;
  currentRole?: UserRole;
};

const FINANCIAL_ROLES = new Set<UserRole>([
  "ADMIN",
  "OWNER",
  "MANAGER",
]);

export default function DriversPanel({
  isOpen,
  onClose,
  accent,
  currentRole,
}: Props) {
  const [data, setData] = useState<LiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDriver, setSelectedDriver] = useState<{ id: string; name: string } | null>(null);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Acceso a la caja del repartidor: por rol financiero (admin/owner/manager) o
  // por el permiso granular `manage_driver_cash` (ej. un cajero al que el admin
  // le delega recibir el efectivo del repartidor). De `canViewFinancial` cuelga
  // ver los resúmenes, abrir el modal de movimientos y cerrar el corte.
  const canManageDriverCash = useAuthStore((s) => s.hasPermission("manage_driver_cash"));
  const canViewFinancial =
    (currentRole ? FINANCIAL_ROLES.has(currentRole) : false) || canManageDriverCash;

  async function fetchLive(silent = false) {
    if (!silent) {
      setLoading(true);
      setError("");
    }

    try {
      const gpsPromise = api.get<LiveResponse>("/api/gps/live");
      const cashPromise = canViewFinancial
        ? api.get<CashSummary[]>("/api/driver-cash/summary/today").catch(() => null)
        : Promise.resolve(null);
      const pendingPromise = canViewFinancial
        ? api.get<PendingOrder[]>("/api/driver-cash/pending-collection").catch(() => null)
        : Promise.resolve(null);
      const [gpsRes, cashRes, pendingRes] = await Promise.all([gpsPromise, cashPromise, pendingPromise]);

      // Solo sobrescribimos en éxito: ante un error de red transitorio dejamos
      // la lista anterior visible en vez de parpadear a vacío.
      if (pendingRes) setPending(pendingRes.data);

      const cashMap = (cashRes?.data || []).reduce(
        (acc: Record<string, DriverRow["cash"]>, item: CashSummary) => {
          acc[item.driver.id] = {
            ...item,
            // El fondo de cambio (float) suma al saldo: es efectivo que el
            // repartidor trae y debe entregar en el corte. Sin él, el saldo
            // mostrado quedaba corto y no cuadraba con el corte real.
            balance: item.float + item.income - item.expense - item.returned,
          };
          return acc;
        },
        {},
      );

      setData({
        ...gpsRes.data,
        drivers: gpsRes.data.drivers.map((driver) => ({
          ...driver,
          cash: canViewFinancial ? cashMap[driver.driver.id] : undefined,
        })),
      });
      setError("");
    } catch (error: unknown) {
      const e = error as AxiosError<ApiError>;
      const status = e?.response?.status;
      if (status === 403) {
        setError("Tu rol no tiene acceso al estado de repartidores.");
      } else {
        setError(e?.response?.data?.error || "No se pudo cargar el rastreo");
      }
    } finally {
      setLoading(false);
    }
  }

  // Marca el pedido como cobrado: el efectivo del repartidor entra a caja.
  // Mismo endpoint que usa el admin (PUT /api/orders/:id/confirm-cash): pone
  // paidAt, dispara el kick del cajón y notifica al TPV.
  async function confirmCash(orderId: string) {
    setConfirmingId(orderId);
    try {
      await api.put(`/api/orders/${orderId}/confirm-cash`);
      setPending(prev => prev.filter(o => o.id !== orderId));
      fetchLive(true); // refresca el resumen de efectivo del repartidor
    } catch (error: unknown) {
      const e = error as AxiosError<ApiError>;
      setError(e?.response?.data?.error || "No se pudo confirmar el cobro");
    } finally {
      setConfirmingId(null);
    }
  }

  // Liquida todos los pendientes de una vez. Secuencial para no saturar el
  // backend ni el cajón; cada confirmación va quitando su fila de la lista.
  async function confirmAll() {
    if (!pending.length) return;
    if (!window.confirm(`¿Confirmar el cobro de ${pending.length} pedidos?`)) return;
    setConfirmingAll(true);
    try {
      for (const o of [...pending]) {
        try {
          await api.put(`/api/orders/${o.id}/confirm-cash`);
          setPending(prev => prev.filter(p => p.id !== o.id));
        } catch { /* deja el pendiente en la lista para reintentar */ }
      }
      fetchLive(true);
    } finally {
      setConfirmingAll(false);
    }
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Carga inicial diferida (ver impresoras): evita set-state-in-effect.
    queueMicrotask(() => { if (!cancelled) fetchLive(false); });
    // Polling cada 10s mientras el panel esté abierto.
    intervalRef.current = setInterval(() => fetchLive(true), 10000);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const drivers = data?.drivers || [];
  const origin = data?.origin || null;
  const onlineCount = drivers.filter(d => d.online).length;
  const onRouteCount = drivers.filter(d => d.activeRoute).length;

  return (
    <div className="fixed inset-0 z-[130] flex justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:w-96 h-full flex flex-col shadow-2xl border-l"
        style={{
          background: "var(--surf)",
          borderColor: "var(--border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {/* Header */}
        <div
          className="p-5 border-b flex items-center justify-between gap-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg)",
            paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          }}
        >
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Bike size={19} style={{ color: accent }} />
              Repartidores
            </h2>
            <p className="text-[11px] font-bold" style={{ color: "var(--text-secondary)" }}>
              {drivers.length} activos · {onlineCount} online · {onRouteCount} en ruta
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white active:scale-95 transition-transform"
            aria-label="Cerrar"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* Pendientes de cobro: entregas sin pago confirmado. El cajero
              liquida aquí el efectivo que trae el repartidor sin salir del TPV. */}
          {canViewFinancial && pending.length > 0 && (
            <div className="border-b" style={{ borderColor: "var(--border)" }}>
              <div
                className="px-5 py-3 flex items-center gap-2"
                style={{ background: "var(--surf2)" }}
              >
                <Banknote size={16} style={{ color: accent }} />
                <span className="text-sm font-semibold text-white">Pendientes de cobro</span>
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                  style={{ background: `${accent}22`, color: accent }}
                >
                  {pending.length}
                </span>
                <span className="ml-auto text-sm font-semibold" style={{ color: accent }}>
                  ${pending.reduce((s, o) => s + (o.total || 0), 0).toFixed(0)}
                </span>
              </div>

              {pending.length > 1 && (
                <button
                  type="button"
                  onClick={confirmAll}
                  disabled={confirmingAll || confirmingId !== null}
                  className="w-full min-h-[44px] flex items-center justify-center gap-2 text-[12px] font-semibold uppercase tracking-wider border-b disabled:opacity-50 active:scale-[0.99] transition-transform"
                  style={{ borderColor: "var(--border)", background: `${accent}14`, color: accent }}
                >
                  {confirmingAll ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                  {confirmingAll ? "Confirmando..." : `Confirmar todo (${pending.length})`}
                </button>
              )}

              <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
                {pending.map(o => {
                  const method = o.paymentMethod === "CASH"
                    ? "Efectivo"
                    : o.paymentMethod === "PENDING"
                      ? "Por cobrar"
                      : (o.paymentMethod || "—");
                  return (
                    <div
                      key={o.id}
                      className="px-5 py-3 flex items-center gap-3"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          #{o.orderNumber}{o.customerName ? ` · ${o.customerName}` : ""}
                        </div>
                        <div className="text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>
                          {o.driverName ? `${o.driverName} · ` : ""}{method}
                          {o.deliveryAddress ? ` · ${o.deliveryAddress}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[9px] uppercase font-bold" style={{ color: "var(--text-secondary)" }}>Total</div>
                        <div className="text-sm font-semibold" style={{ color: accent }}>${(o.total || 0).toFixed(0)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => confirmCash(o.id)}
                        disabled={confirmingId === o.id || confirmingAll}
                        aria-label="Confirmar cobro"
                        className="shrink-0 min-w-[44px] min-h-[44px] w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-50 active:scale-95 transition-transform"
                        style={{ background: `${accent}1f`, color: accent, border: `1px solid ${accent}40` }}
                      >
                        {confirmingId === o.id
                          ? <Loader2 size={18} className="animate-spin" />
                          : <CheckCircle2 size={18} strokeWidth={2.5} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {loading && (
            <div className="h-full min-h-48 flex flex-col items-center justify-center gap-3 p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
              <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
              Cargando repartidores...
            </div>
          )}

          {!loading && error && (
            <div className="m-4 p-5 rounded-xl text-sm bg-red-500/10 text-red-400 border border-red-500/20 flex flex-col items-center text-center gap-3">
              <AlertCircle size={28} />
              <span>{error}</span>
              <button
                type="button"
                onClick={() => fetchLive(false)}
                className="min-h-[44px] px-4 rounded-xl border border-red-400/30 bg-red-400/10 font-semibold uppercase tracking-wider text-[11px] flex items-center gap-2 active:scale-95 transition-transform"
              >
                <RefreshCw size={15} />
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && drivers.length === 0 && (
            <div className="min-h-48 p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                <Users size={23} style={{ color: "var(--text-secondary)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                No hay repartidores registrados.
              </p>
            </div>
          )}

          {!loading && !error && drivers.length > 0 && (
            <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
              {drivers.map(d => {
                const dist = d.location && origin
                  ? haversineMeters(d.location, origin)
                  : null;
                const last = d.location ? formatRelative(d.location.createdAt) : "sin señal";
                return (
                  <div
                    key={d.driver.id}
                    className={`px-5 py-4 flex items-start gap-3 transition-colors ${
                      canViewFinancial
                        ? "hover:bg-white/5 cursor-pointer"
                        : "cursor-default"
                    }`}
                    style={{ borderColor: "var(--border)" }}
                    onClick={() => {
                      if (canViewFinancial) {
                        setSelectedDriver({ id: d.driver.id, name: d.driver.name });
                      }
                    }}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 overflow-hidden"
                      style={{ background: "var(--surf2)", border: "1px solid var(--border)" }}
                    >
                      {d.driver.photo ? (
                        <img src={d.driver.photo} alt={d.driver.name} className="w-full h-full object-cover" />
                      ) : (
                        d.driver.name.split(" ").map(p => p[0]).slice(0, 2).join("")
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white truncate">{d.driver.name}</span>
                        <span
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ background: d.online ? "#22c55e" : "#6b7280" }}
                          title={d.online ? "Online" : "Desconectado"}
                        />
                      </div>

                      {canViewFinancial && d.cash && (
                        <div className="mt-2 flex gap-1.5 flex-wrap">
                          <div
                            className="px-2 py-1 rounded-lg border"
                            style={{ background: "color-mix(in srgb, var(--warning) 12%, transparent)", borderColor: "color-mix(in srgb, var(--warning) 25%, transparent)" }}
                          >
                            <div className="text-[9px] font-bold uppercase leading-none mb-0.5" style={{ color: "var(--warning)" }}>Fondo</div>
                            <div className="text-xs font-semibold" style={{ color: "var(--warning)" }}>${(d.cash.float || 0).toFixed(0)}</div>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20">
                            <div className="text-[9px] text-green-400 font-bold uppercase leading-none mb-0.5">Ingresos</div>
                            <div className="text-xs font-semibold text-green-400">${d.cash.income.toFixed(0)}</div>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="text-[9px] text-red-400 font-bold uppercase leading-none mb-0.5">Gastos</div>
                            <div className="text-xs font-semibold text-red-400">${d.cash.expense.toFixed(0)}</div>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
                            <div className="text-[9px] text-blue-400 font-bold uppercase leading-none mb-0.5">Entregas</div>
                            <div className="text-xs font-semibold text-blue-400">{d.cash.deliveries}</div>
                          </div>
                          <div className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 ml-auto">
                            <div className="text-[9px] text-white/40 font-bold uppercase leading-none mb-0.5">Saldo</div>
                            <div className="text-xs font-semibold text-white">${d.cash.balance.toFixed(0)}</div>
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] mt-2" style={{ color: "var(--text-secondary)" }}>
                        {d.activeRoute ? (
                          <span style={{ color: accent }}>● En ruta desde {formatRelative(d.activeRoute.startAt)}</span>
                        ) : (
                          <span>{d.online ? "Disponible" : "Desconectado"}</span>
                        )}
                      </div>
                      <div className="text-[11px] mt-0.5 flex gap-2" style={{ color: "var(--text-secondary)" }}>
                        <span>Última señal {last}</span>
                        {dist !== null && (
                          <>
                            <span>·</span>
                            <span>{formatDistance(dist)} del local</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-3 text-[11px] border-t flex items-center justify-between"
          style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text-secondary)" }}
        >
          <span>Actualiza cada 10s</span>
          <button
            onClick={() => fetchLive(false)}
            className="font-bold"
            style={{ color: accent }}
          >
            Refrescar ahora
          </button>
        </div>

        {canViewFinancial && selectedDriver && (
          <DriverMovementsModal
            driver={selectedDriver}
            onClose={() => setSelectedDriver(null)}
            onRefresh={() => fetchLive(true)}
            accent={accent}
            canCut={canViewFinancial}
          />
        )}
      </div>
    </div>
  );
}
