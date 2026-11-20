"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Banknote,
  Bike,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  CreditCard,
  Download,
  FileText,
  Printer,
  Receipt,
  RotateCw,
  Search,
  User,
  Wallet,
  X,
} from "lucide-react";
import api from "@/lib/api";
import { formatMoney } from "@/lib/format";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Pill,
  Select,
  Skeleton,
  StatTile,
  useToast,
  type Tone,
} from "@/components/ds";
import { STATUS_META, type Order } from "./orders";

type DatePreset = "today" | "7d" | "30d" | "thisMonth" | "lastMonth" | "all" | "custom";

const PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "Últ. 7 días" },
  { key: "30d", label: "Últ. 30 días" },
  { key: "thisMonth", label: "Este mes" },
  { key: "lastMonth", label: "Mes pasado" },
  { key: "all", label: "Todo el historial" },
];

const PAY_METHOD_LABELS: Record<string, string> = {
  CASH: "Efectivo",
  CASH_ON_DELIVERY: "Efectivo",
  TRANSFER: "Transferencia",
  SPEI: "Transferencia",
  CARD: "Tarjeta",
  CARD_PRESENT: "Tarjeta",
  ONLINE: "En línea",
  MIXED: "Mixto",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  DINE_IN: "Mesa",
  TAKEOUT: "Para llevar",
  DELIVERY: "A domicilio",
};

function toYmdCdmx(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "2026";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function getPresetDates(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  const today = toYmdCdmx(now);
  if (preset === "today") {
    return { from: today, to: today };
  }
  if (preset === "7d") {
    const d = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    return { from: toYmdCdmx(d), to: today };
  }
  if (preset === "30d") {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: toYmdCdmx(d), to: today };
  }
  if (preset === "thisMonth") {
    const [y, m] = today.split("-");
    return { from: `${y}-${m}-01`, to: today };
  }
  if (preset === "lastMonth") {
    const [yStr, mStr] = today.split("-");
    let y = Number(yStr);
    let m = Number(mStr) - 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const mm = String(m).padStart(2, "0");
    const lastDay = new Date(y, m, 0).getDate();
    return {
      from: `${y}-${mm}-01`,
      to: `${y}-${mm}-${String(lastDay).padStart(2, "0")}`,
    };
  }
  return { from: "", to: "" };
}

function formatCdmxDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isCashMethod(m?: string | null): boolean {
  const u = (m || "").toUpperCase();
  return u === "CASH" || u === "CASH_ON_DELIVERY";
}

function isTransferMethod(m?: string | null): boolean {
  const u = (m || "").toUpperCase();
  return u === "TRANSFER" || u === "SPEI";
}

function isCardMethod(m?: string | null): boolean {
  const u = (m || "").toUpperCase();
  return ["CARD", "CARD_PRESENT", "TERMINAL", "CLIP", "MP_POINT", "DEBIT", "CREDIT"].includes(u);
}

interface TicketsHistoryPanelProps {
  onCobrarOrder?: (order: Order) => void;
  onPrintOrder?: (orderId: string) => void;
}

export default function TicketsHistoryPanel({
  onCobrarOrder,
  onPrintOrder,
}: TicketsHistoryPanelProps) {
  const toast = useToast();

  // Por defecto: últimos 30 días, tickets cobrados, ordenados por fecha de cobro.
  const initialRange = useMemo(() => getPresetDates("30d"), []);
  const [preset, setPreset] = useState<DatePreset>("30d");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);
  const [dateField, setDateField] = useState<"paidAt" | "createdAt" | "both">("paidAt");
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "PENDING" | "ALL" | "REFUNDED">("PAID");
  const [paymentMethod, setPaymentMethod] = useState<"ALL" | "CASH" | "TRANSFER" | "CARD">("ALL");

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [expandAll, setExpandAll] = useState(false);

  // Debounce del texto de búsqueda (280ms)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 280);
    return () => clearTimeout(t);
  }, [search]);

  const applyPreset = (nextPreset: DatePreset) => {
    setPreset(nextPreset);
    if (nextPreset === "custom") return;
    const range = getPresetDates(nextPreset);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("scope", "history");
      params.set("includeItems", "1");
      params.set("limit", "1000");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      params.set("dateField", dateField);
      params.set("paymentStatus", paymentStatus);
      if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);

      const res = await api.get<Order[]>(`/api/orders/admin?${params.toString()}`);
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      console.error("Error buscando tickets:", e);
      toast.error("No se pudieron cargar los tickets del historial");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, dateFrom, dateTo, dateField, paymentStatus, paymentMethod, toast]);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  // Estadísticas agregadas del resultado actual
  const stats = useMemo(() => {
    let paidTotal = 0;
    let paidCount = 0;
    let cashTotal = 0;
    let cashCount = 0;
    let transferTotal = 0;
    let transferCount = 0;
    let cardTotal = 0;
    let cardCount = 0;
    let pendingTotal = 0;
    let pendingCount = 0;

    for (const o of orders) {
      const amount = Number(o.total ?? 0);
      if (o.paymentStatus === "PAID") {
        paidTotal += amount;
        paidCount += 1;
        if (isCashMethod(o.paymentMethod)) {
          cashTotal += amount;
          cashCount += 1;
        } else if (isTransferMethod(o.paymentMethod)) {
          transferTotal += amount;
          transferCount += 1;
        } else if (isCardMethod(o.paymentMethod)) {
          cardTotal += amount;
          cardCount += 1;
        }
      } else if (o.paymentStatus === "PENDING" && o.status !== "CANCELLED") {
        pendingTotal += amount;
        pendingCount += 1;
      }
    }

    return {
      paidTotal,
      paidCount,
      cashTotal,
      cashCount,
      transferTotal,
      transferCount,
      cardTotal,
      cardCount,
      pendingTotal,
      pendingCount,
    };
  }, [orders]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleExpandAll = () => {
    const next = !expandAll;
    setExpandAll(next);
    if (next) {
      const allMap: Record<string, boolean> = {};
      for (const o of orders) allMap[o.id] = true;
      setExpandedIds(allMap);
    } else {
      setExpandedIds({});
    }
  };

  const handleClearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    applyPreset("30d");
    setPaymentStatus("PAID");
    setPaymentMethod("ALL");
    setDateField("paidAt");
  };

  // Copia un resumen limpio al portapapeles (ideal para enviar por WhatsApp)
  const handleCopySummary = async () => {
    if (orders.length === 0) return;
    const rangeLabel =
      dateFrom || dateTo
        ? `${dateFrom || "inicio"} al ${dateTo || "hoy"}`
        : "Historial completo";
    const filterTitle = debouncedSearch ? ` — "${debouncedSearch}"` : "";

    const lines: string[] = [
      `📋 *RESUMEN DE TICKETS${filterTitle.toUpperCase()}*`,
      `📅 Periodo: ${rangeLabel}`,
      `✅ Tickets cobrados: ${stats.paidCount} (${formatMoney(stats.paidTotal)})`,
    ];
    if (stats.cashCount > 0) {
      lines.push(`   • Efectivo: ${formatMoney(stats.cashTotal)} (${stats.cashCount})`);
    }
    if (stats.transferCount > 0) {
      lines.push(`   • Transferencia: ${formatMoney(stats.transferTotal)} (${stats.transferCount})`);
    }
    if (stats.cardCount > 0) {
      lines.push(`   • Tarjeta: ${formatMoney(stats.cardTotal)} (${stats.cardCount})`);
    }
    if (stats.pendingCount > 0) {
      lines.push(`⏳ Pendientes por cobrar: ${stats.pendingCount} (${formatMoney(stats.pendingTotal)})`);
    }
    lines.push("────────────────────");

    for (const o of orders) {
      const client = o.ticketName || o.customerName || o.user?.name || "Público general";
      const method = PAY_METHOD_LABELS[o.paymentMethod || ""] || o.paymentMethod || "—";
      const statusText = o.paymentStatus === "PAID" ? "Cobrado" : "Pendiente";
      const dateText = formatCdmxDateTime(o.paidAt || o.createdAt);
      lines.push(
        `*#${o.orderNumber}* · ${client} · *${formatMoney(o.total ?? 0)}* (${statusText} - ${method})`,
      );
      lines.push(`   🕒 ${dateText}`);
      if (o.items && o.items.length > 0) {
        for (const it of o.items) {
          const itemName = it.name || it.menuItem?.name || "Producto";
          const unit = Number(it.unitPrice ?? it.price ?? 0);
          const sub = Number(it.subtotal ?? unit * Number(it.quantity ?? 1));
          lines.push(`   - ${it.quantity}x ${itemName} (${formatMoney(sub)})`);
        }
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Resumen copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  };

  // Exporta los resultados filtrados a CSV con su desglose de productos
  const handleExportCsv = () => {
    if (orders.length === 0) return;
    const escapeCsv = (val: unknown) => {
      const s = String(val ?? "").replace(/"/g, '""');
      return `"${s}"`;
    };
    const headers = [
      "Ticket",
      "Cliente",
      "Estado Orden",
      "Estado Pago",
      "Metodo Pago",
      "Tipo",
      "Fecha Pedido (CDMX)",
      "Fecha Cobro (CDMX)",
      "Repartidor",
      "Tomado Por",
      "Total",
      "Detalle Consumo",
    ];
    const rows = orders.map((o) => {
      const client = o.ticketName || o.customerName || o.user?.name || "Público general";
      const itemsSummary = (o.items || [])
        .map((it) => {
          const itemName = it.name || it.menuItem?.name || "Producto";
          const unit = Number(it.unitPrice ?? it.price ?? 0);
          const sub = Number(it.subtotal ?? unit * Number(it.quantity ?? 1));
          return `${it.quantity}x ${itemName} ($${sub.toFixed(2)})`;
        })
        .join(" | ");
      return [
        o.orderNumber,
        client,
        o.status,
        o.paymentStatus || "",
        PAY_METHOD_LABELS[o.paymentMethod || ""] || o.paymentMethod || "",
        ORDER_TYPE_LABELS[o.orderType || ""] || o.orderType || "",
        formatCdmxDateTime(o.createdAt),
        formatCdmxDateTime(o.paidAt),
        o.deliveryDriverName || "",
        o.createdByName || "",
        Number(o.total ?? 0).toFixed(2),
        itemsSummary,
      ]
        .map(escapeCsv)
        .join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const slug = debouncedSearch
      ? debouncedSearch.toLowerCase().replace(/[^a-z0-9]+/g, "-")
      : "historial";
    a.href = url;
    a.download = `tickets-${slug}-${dateFrom || "inicio"}-${dateTo || "hoy"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* PANEL DE BÚSQUEDA Y FILTROS */}
      <Card>
        <div className="space-y-3.5">
          {/* Fila 1: Buscador principal + Presets rápidos de fecha */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-tx-dim"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre de cliente (ej. Perusi, Richard), #ticket, teléfono, nota o platillo…"
                className="pl-10 pr-9"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar texto"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-tx-mut hover:text-tx-hi"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {PRESETS.map((p) => {
                const active = preset === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => applyPreset(p.key)}
                    className="rounded-ds-md px-3 py-1.5 text-xs font-bold transition-colors"
                    style={{
                      background: active ? "var(--brand-primary)" : "var(--surf-2)",
                      color: active ? "#fff" : "var(--tx-mut)",
                      border: `1px solid ${active ? "var(--brand-primary)" : "var(--bd-1)"}`,
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fila 2: Rango de fechas exacto + selectores de estado y método */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Desde
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setPreset("custom");
                  setDateFrom(e.target.value);
                }}
              />
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Hasta
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setPreset("custom");
                  setDateTo(e.target.value);
                }}
              />
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Filtrar fecha por
              </label>
              <Select
                value={dateField}
                onChange={(e) =>
                  setDateField(e.target.value as "paidAt" | "createdAt" | "both")
                }
              >
                <option value="paidAt">Fecha de cobro (paidAt)</option>
                <option value="createdAt">Fecha de pedido (createdAt)</option>
                <option value="both">Ambas (pedido o cobro)</option>
              </Select>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Estado de pago
              </label>
              <Select
                value={paymentStatus}
                onChange={(e) => {
                  const val = e.target.value as "PAID" | "PENDING" | "ALL" | "REFUNDED";
                  setPaymentStatus(val);
                  if (val === "PENDING") setDateField("createdAt");
                  else if (val === "PAID") setDateField("paidAt");
                  else setDateField("both");
                }}
              >
                <option value="PAID">Cobrados (PAID)</option>
                <option value="PENDING">Pendientes / Fiados (PENDING)</option>
                <option value="ALL">Todos (Cobrados + Pendientes)</option>
                <option value="REFUNDED">Reembolsados (REFUNDED)</option>
              </Select>
            </div>

            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[.12em] text-tx-mut">
                Método de pago
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) =>
                  setPaymentMethod(
                    e.target.value as "ALL" | "CASH" | "TRANSFER" | "CARD",
                  )
                }
              >
                <option value="ALL">Todos los métodos</option>
                <option value="CASH">Efectivo</option>
                <option value="TRANSFER">Transferencia</option>
                <option value="CARD">Tarjeta</option>
              </Select>
            </div>
          </div>

          {/* Fila 3: Barra de acciones del buscador */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3" style={{ borderColor: "var(--bd-1)" }}>
            <div className="flex flex-wrap items-center gap-2 text-xs text-tx-mut">
              <span>
                Mostrando <strong className="text-tx-hi">{orders.length}</strong>{" "}
                ticket{orders.length === 1 ? "" : "s"}
              </span>
              {debouncedSearch && (
                <Pill tone="ac">Filtro: &ldquo;{debouncedSearch}&rdquo;</Pill>
              )}
              {(dateFrom || dateTo) && (
                <Pill tone="neutral">
                  {dateFrom || "Inicio"} → {dateTo || "Hoy"}
                </Pill>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {orders.length > 0 && (
                <>
                  <Button
                    variant="ghost"
                    icon={expandAll ? ChevronUp : ChevronDown}
                    onClick={handleToggleExpandAll}
                  >
                    {expandAll ? "Contraer consumos" : "Ver todos los consumos"}
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Copy}
                    onClick={handleCopySummary}
                  >
                    Copiar resumen
                  </Button>
                  <Button
                    variant="secondary"
                    icon={Download}
                    onClick={handleExportCsv}
                  >
                    Exportar CSV
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                icon={RotateCw}
                onClick={fetchHistory}
                disabled={loading}
              >
                Actualizar
              </Button>
              {(search || preset !== "30d" || paymentStatus !== "PAID" || paymentMethod !== "ALL") && (
                <Button variant="danger" icon={X} onClick={handleClearFilters}>
                  Restablecer
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* KPIs DEL RESULTADO FILTRADO */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          icon={CheckCircle2}
          value={formatMoney(stats.paidTotal, false)}
          label={`Total cobrado (${stats.paidCount} ticket${stats.paidCount === 1 ? "" : "s"})`}
        />
        <StatTile
          icon={Banknote}
          value={formatMoney(stats.cashTotal, false)}
          label={`Efectivo (${stats.cashCount})`}
        />
        <StatTile
          icon={ArrowLeftRight}
          value={formatMoney(stats.transferTotal + stats.cardTotal, false)}
          label={`Transf. (${stats.transferCount}) · Tarjeta (${stats.cardCount})`}
        />
        <StatTile
          icon={Clock}
          value={formatMoney(stats.pendingTotal, false)}
          label={`Pendiente por cobrar (${stats.pendingCount})`}
        />
      </div>

      {/* LISTA DE TICKETS ENCONTRADOS */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-ds-lg" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No se encontraron tickets con esos filtros"
          hint={
            debouncedSearch
              ? `No hay tickets para "${debouncedSearch}" en el rango seleccionado. Prueba elegir "Todo el historial" o cambiar el estado de pago a "Todos".`
              : "Ajusta el rango de fechas o escribe el nombre del cliente."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {orders.map((order) => {
            const clientName =
              order.ticketName ||
              order.customerName ||
              order.user?.name ||
              "Público general";
            const isPaid = order.paymentStatus === "PAID";
            const isPending = order.paymentStatus === "PENDING";
            const payTone: Tone = isPaid ? "ok" : isPending ? "warn" : "err";
            const payLabel = isPaid
              ? "Cobrado"
              : isPending
                ? "Pendiente"
                : order.paymentStatus || "—";
            const methodLabel =
              PAY_METHOD_LABELS[order.paymentMethod || ""] ||
              order.paymentMethod ||
              "Sin método";
            const typeLabel =
              ORDER_TYPE_LABELS[order.orderType || ""] ||
              order.orderType ||
              "Mostrador";
            const statusMeta = STATUS_META[order.status] || {
              label: order.status,
              tone: "neutral" as Tone,
            };
            const isExpanded = Boolean(expandedIds[order.id]);
            const itemsCount = order.items?.length ?? 0;

            // Verificamos si se cobró en un día distinto al que se pidió
            const createdDay = order.createdAt ? toYmdCdmx(new Date(order.createdAt)) : "";
            const paidDay = order.paidAt ? toYmdCdmx(new Date(order.paidAt)) : "";
            const paidDifferentDay = Boolean(order.paidAt && createdDay && paidDay && createdDay !== paidDay);

            return (
              <div
                key={order.id}
                className="rounded-ds-lg transition-colors"
                style={{
                  background: "var(--surf-1)",
                  border: `1px solid ${isExpanded ? "var(--bd-2)" : "var(--bd-1)"}`,
                }}
              >
                {/* Cabecera del ticket */}
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-extrabold text-primary">
                        #{order.orderNumber}
                      </span>
                      <span className="text-base font-extrabold text-tx-hi">
                        {clientName}
                      </span>
                      <Pill tone={payTone}>{payLabel}</Pill>
                      <Pill tone="neutral">{methodLabel}</Pill>
                      <Pill tone={statusMeta.tone}>{statusMeta.label}</Pill>
                      <span className="rounded-md px-2 py-0.5 font-mono text-[11px] text-tx-mut" style={{ background: "var(--surf-2)" }}>
                        {typeLabel}
                        {order.table?.name ? ` · ${order.table.name}` : ""}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-tx-mut">
                      {order.paidAt ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 size={13} style={{ color: "var(--ok)" }} />
                          <strong>Cobrado:</strong> {formatCdmxDateTime(order.paidAt)}
                        </span>
                      ) : null}

                      <span className="inline-flex items-center gap-1.5">
                        <Calendar size={13} />
                        <strong>{paidDifferentDay || !order.paidAt ? "Pedido:" : "Creado:"}</strong>{" "}
                        {formatCdmxDateTime(order.createdAt)}
                      </span>

                      {order.deliveryDriverName && (
                        <span className="inline-flex items-center gap-1">
                          <Bike size={13} />
                          Repartidor: <strong className="text-tx">{order.deliveryDriverName}</strong>
                        </span>
                      )}

                      {order.createdByName && (
                        <span className="inline-flex items-center gap-1">
                          <User size={13} />
                          Tomó: <strong className="text-tx">{order.createdByName}</strong>
                        </span>
                      )}

                      {order.customerPhone && (
                        <span>Tel: {order.customerPhone}</span>
                      )}
                    </div>

                    {order.notes && (
                      <div className="text-xs italic text-tx-mut">
                        Nota: {order.notes}
                      </div>
                    )}
                  </div>

                  {/* Monto total y botones de acción */}
                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <div className="text-right">
                      <div className="font-display text-xl font-extrabold tabular-nums text-tx-hi">
                        {formatMoney(order.total ?? 0)}
                      </div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-tx-mut">
                        {itemsCount} {itemsCount === 1 ? "partida" : "partidas"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        icon={isExpanded ? ChevronUp : ChevronDown}
                        onClick={() => toggleExpand(order.id)}
                      >
                        {isExpanded ? "Ocultar" : "Consumo"}
                      </Button>

                      {isPending && order.status !== "CANCELLED" && onCobrarOrder && (
                        <Button
                          icon={Wallet}
                          onClick={() => onCobrarOrder(order)}
                        >
                          Cobrar
                        </Button>
                      )}

                      {onPrintOrder && (
                        <Button
                          variant="ghost"
                          icon={Printer}
                          onClick={() => onPrintOrder(order.id)}
                        >
                          Imprimir
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Desglose expandible de productos del ticket */}
                {isExpanded && (
                  <div
                    className="border-t px-4 py-3"
                    style={{
                      borderColor: "var(--bd-1)",
                      background: "var(--surf-2)",
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-tx-mut">
                        Desglose del consumo · Ticket #{order.orderNumber}
                      </span>
                      {paidDifferentDay && (
                        <span className="text-xs font-semibold text-primary">
                          Pedido el {formatCdmxDateTime(order.createdAt)} → Liquidado el{" "}
                          {formatCdmxDateTime(order.paidAt)}
                        </span>
                      )}
                    </div>

                    {!order.items || order.items.length === 0 ? (
                      <div className="py-2 text-xs text-tx-mut">
                        Este ticket no tiene partidas registradas (o fueron transferidas a otra cuenta).
                      </div>
                    ) : (
                      <div className="divide-y" style={{ borderColor: "var(--bd-1)" }}>
                        {order.items.map((it, idx) => {
                          const itemName = it.name || it.menuItem?.name || "Producto";
                          const qty = Number(it.quantity ?? 1);
                          const unitPrice = Number(it.unitPrice ?? it.price ?? 0);
                          const lineTotal = Number(it.subtotal ?? unitPrice * qty);

                          return (
                            <div
                              key={it.id || `${order.id}-item-${idx}`}
                              className="flex items-start justify-between gap-4 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-primary">
                                  {qty}x
                                </span>{" "}
                                <span className="font-semibold text-tx-hi">
                                  {itemName}
                                </span>
                                <span className="ml-2 font-mono text-[11px] text-tx-mut">
                                  ({formatMoney(unitPrice)} c/u)
                                </span>
                                {it.notes && (
                                  <div className="mt-0.5 text-[11px] italic text-tx-mut">
                                    {it.notes}
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 font-mono font-bold tabular-nums text-tx-hi">
                                {formatMoney(lineTotal)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Subtotales / Descuento / Envío / Total */}
                    <div
                      className="mt-2 flex flex-wrap items-center justify-end gap-4 border-t pt-2.5 text-xs"
                      style={{ borderColor: "var(--bd-1)" }}
                    >
                      {typeof order.subtotal === "number" && (
                        <span className="text-tx-mut">
                          Subtotal: <strong className="text-tx">{formatMoney(order.subtotal)}</strong>
                        </span>
                      )}
                      {Number(order.discount ?? 0) > 0 && (
                        <span className="text-tx-mut">
                          Descuento:{" "}
                          <strong style={{ color: "var(--ok)" }}>
                            -{formatMoney(order.discount ?? 0)}
                          </strong>
                        </span>
                      )}
                      {Number(order.deliveryFee ?? 0) > 0 && (
                        <span className="text-tx-mut">
                          Envío: <strong className="text-tx">{formatMoney(order.deliveryFee ?? 0)}</strong>
                        </span>
                      )}
                      <span className="text-sm font-extrabold text-tx-hi">
                        Total: {formatMoney(order.total ?? 0)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
