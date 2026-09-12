"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, Printer, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import api from "../lib/api";
import { canPerform } from "../lib/access";
import { useAuthStore } from "../store/authStore";
import { useSettingsStore } from "../store/settingsStore";
import { printTokkiOrder } from "../lib/tokki-printers";
import type { PrinterRecord, TicketItem } from "../lib/printer-tcp";
import PaymentModal, { type TokkiPaymentMethod } from "./PaymentModal";
import { orderTypeName } from "../lib/online-orders";

type Order = { id: string; orderNumber: string; customerName?: string; total: number; status: string; paymentStatus: string; paymentMethod?: string; orderType?: string; source?: string; createdAt: string };
type OrderDetail = Order & { table?: { name?: string }; tableNumber?: string | number; items: Array<{ name?: string; menuItem?: { name: string }; quantity: number; price?: number; unitPrice?: number; notes?: string; modifiers?: Array<{ name: string; priceAdd?: number }> }> };
const statusNames: Record<string, string> = { PENDING: "Pendiente", OPEN: "Abierta", CONFIRMED: "Confirmada", PREPARING: "En preparación", READY: "Lista", PACKING: "Empacando", DELIVERED: "Entregada", COMPLETED: "Terminada" };

export default function OpenOrdersModal({ printers, preview, onClose }: { printers: PrinterRecord[]; preview: boolean; onClose: () => void }) {
  const employee = useAuthStore(s => s.employee);
  const methods = useSettingsStore(s => s.paymentMethods);
  const [orders, setOrders] = useState<Order[]>([]);
  const [history, setHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [payment, setPayment] = useState<Order | null>(null);
  const lock = useRef(false);
  const loadVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError("");
    try {
      const data = preview ? [] : (await api.get<Order[]>(`/api/orders/open-tokki${history ? "?history=1" : ""}`, { timeout: 12000 })).data;
      if (version === loadVersion.current) setOrders(data);
    } catch { if (version === loadVersion.current) setError("No se pudieron cargar las órdenes. Revisa tu conexión y vuelve a intentar."); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [history, preview]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load]);
  useEffect(() => {
    const changed = () => void load();
    window.addEventListener("tokki-orders-changed", changed);
    return () => window.removeEventListener("tokki-orders-changed", changed);
  }, [load]);

  const reprint = async (order: Order) => {
    if (lock.current || !canPerform(useAuthStore.getState().employee, "orders")) return;
    lock.current = true; setBusy(order.id);
    try {
      const { data } = await api.get<OrderDetail>(`/api/orders/${order.id}`, { timeout: 12000 });
      const items: TicketItem[] = data.items.map(item => ({ name: item.name || item.menuItem?.name || "Producto", quantity: item.quantity, price: Number(item.unitPrice ?? item.price ?? 0), notes: item.notes, modifiers: item.modifiers }));
      await printTokkiOrder(printers, { orderNumber: data.orderNumber, orderType: data.orderType || "TAKEOUT", tableNumber: data.table?.name || (data.tableNumber != null ? String(data.tableNumber) : null), customerName: data.customerName, items, paid: data.paymentStatus === "PAID", paymentMethod: data.paymentMethod || null, isReprint: true });
      toast.success("Comanda enviada a la impresora.");
    } catch (cause) { toast.error(cause instanceof Error ? cause.message : "No se pudo imprimir."); }
    finally { lock.current = false; setBusy(null); }
  };
  const charge = async (method: TokkiPaymentMethod) => {
    if (!payment || preview || !canPerform(useAuthStore.getState().employee, "pay")) throw new Error("Necesitas permiso de cobro.");
    const { data: fresh } = await api.get<Order>(`/api/orders/${payment.id}`, { timeout: 12000 });
    if (fresh.paymentStatus === "PAID") { setPayment(null); void load(); throw new Error("Esta orden ya está pagada."); }
    if (Number(fresh.total) !== Number(payment.total)) { setPayment(fresh); throw new Error("El total cambió. Revisa el importe actualizado antes de cobrar."); }
    await api.put(`/api/orders/${payment.id}/payment`, { paymentMethod: method }, { timeout: 15000 });
    setPayment(null); toast.success("Orden cobrada. No se creó otra venta."); void load();
  };
  const visible = orders.filter(o => `${o.orderNumber} ${o.customerName || ""}`.toLowerCase().includes(query.toLowerCase().trim()));
  return <div className="tokki-overlay" role="dialog" aria-modal="true" aria-labelledby="open-orders-title">
    <section className="orders-sheet">
      <header><div><ClipboardList /><h2 id="open-orders-title">Órdenes abiertas</h2></div><button onClick={onClose} disabled={!!busy} aria-label="Cerrar órdenes"><X /></button></header>
      <nav aria-label="Estado de órdenes"><button aria-pressed={!history} onClick={() => setHistory(false)} disabled={!!busy}>Abiertas</button><button aria-pressed={history} onClick={() => setHistory(true)} disabled={!!busy}>Recientes · 48 h</button><button onClick={() => void load()} disabled={loading || !!busy} aria-label="Actualizar órdenes"><RefreshCw size={18} /></button></nav>
      <input aria-label="Buscar orden o cliente" placeholder="Buscar número o nombre…" value={query} onChange={e => setQuery(e.target.value)} />
      <p className="orders-hint">Mostrador y pedidos recibidos desde la tienda. Reimprimir no vuelve a cobrar.{preview ? " Vista previa: no se consultan ventas reales." : ""}</p>
      <div className="orders-list" aria-busy={loading}>
        {loading ? <p>Cargando órdenes…</p> : error ? <p role="alert">{error}</p> : !visible.length ? <p>No hay órdenes {history ? "recientes" : "abiertas"}.</p> : visible.map(order => <article key={order.id}>
          <div><b>#{order.orderNumber} · {order.customerName || "Sin nombre"}</b><small>{orderTypeName(order.orderType)}{order.source === "ONLINE" ? " · Tienda en línea" : ""} · {new Date(order.createdAt).toLocaleString("es-MX")} · {statusNames[order.status] || order.status}</small><span>{order.paymentStatus === "PAID" ? "Pagada" : "Pendiente de cobro"} · ${Number(order.total).toFixed(2)}</span></div>
          <div className="order-actions"><button disabled={!!busy} onClick={() => void reprint(order)}><Printer size={17} /> {busy === order.id ? "Imprimiendo…" : "Reimprimir"}</button>{order.paymentStatus !== "PAID" && <button disabled={!!busy || !canPerform(employee, "pay")} title={!canPerform(employee, "pay") ? "Cambia a un cajero con permiso de cobro" : undefined} onClick={() => setPayment(order)}>Cobrar</button>}</div>
        </article>)}
      </div>
      {orders.length >= 200 && <p className="orders-hint">Mostrando las 200 órdenes más recientes del filtro.</p>}
    </section>
    {payment && <PaymentModal total={Number(payment.total)} enabledMethods={methods} onClose={() => setPayment(null)} onSuccess={charge} />}
  </div>;
}
