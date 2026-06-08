/**
 * useAutoPrintOnline.ts
 *
 * Auto-impresión de pedidos de la tienda ONLINE en la tablet TPV.
 *
 * Por qué aquí y no en el backend: las impresoras térmicas viven en la LAN
 * del restaurante y Railway no tiene ruta a esas IPs privadas (ver
 * printer-tcp.ts). La tablet TPV sí está en la misma red, así que la
 * impresión real ocurre en el cliente.
 *
 * Flujo: useNotifications recibe `order:new` por Socket.io y reemite un
 * CustomEvent local `tpv:order:new`. Este hook lo escucha y, SOLO si:
 *   1. el toggle `autoPrintOnline` de la sucursal está activo, y
 *   2. el pedido viene de la tienda online (source ONLINE/STORE),
 * imprime la comanda de cocina (KITCHEN+BAR) y el ticket del cliente
 * (CASHIER) usando las mismas funciones que el resto del TPV.
 *
 * Dedup por id de orden para no reimprimir si el evento llega dos veces.
 */
"use client";
import { useEffect, useRef } from "react";
import api from "@/lib/api";
import { useTpvConfig } from "@/hooks/useTpvConfig";
import {
  printKitchenTickets,
  printCustomerReceipt,
  type PrinterRecord,
  type TicketItem,
} from "@/lib/printer-tcp";

type RawPrinter = PrinterRecord & {
  printerGroups?: Array<{ printerGroup?: { id?: string } | null }>;
};

// Mapea los items de la orden (payload del socket) al shape que esperan los
// builders de ticket. El nombre ya trae la variante incorporada desde el
// backend (ej. "Hamburguesa (Doble)"); las notas y modificadores se
// conservan si el payload los incluye.
function mapItems(order: Record<string, unknown>): TicketItem[] {
  const items = Array.isArray(order?.items) ? (order.items as Record<string, unknown>[]) : [];
  return items.map((it) => ({
    name: String(it.name || (it.menuItem as { name?: string })?.name || "Producto"),
    quantity: Number(it.quantity) || 1,
    price: Number(it.price) || 0,
    notes: (it.notes as string) ?? null,
    modifiers: Array.isArray(it.modifiers)
      ? (it.modifiers as Record<string, unknown>[]).map((m) => ({
          name: String(m.name || ""),
          priceAdd: Number(m.priceAdd || 0),
        }))
      : null,
  }));
}

export function useAutoPrintOnline() {
  const cfg = useTpvConfig();
  const enabled = Boolean((cfg?.extra as Record<string, unknown> | undefined)?.autoPrintOnline);

  // Refs para que el listener (registrado una sola vez) lea siempre el valor
  // actual del toggle sin re-suscribirse en cada cambio de config.
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const printedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handler = async (ev: Event) => {
      if (!enabledRef.current) return;

      const order = (ev as CustomEvent).detail as Record<string, unknown> | undefined;
      if (!order) return;

      // Solo pedidos de la tienda online. NO confiamos en heurísticas de
      // "sin source": exigimos source explícito para no reimprimir pedidos
      // creados en el propio TPV (que ya imprime al cobrar) ni de kiosko.
      const source = String(order.source || "");
      if (source !== "ONLINE" && source !== "STORE") return;

      const id = String(order.id ?? order.orderNumber ?? "");
      if (!id || printedRef.current.has(id)) return;
      printedRef.current.add(id);

      // Cargar impresoras de la sucursal y derivar printerGroupIds (igual que
      // SidebarTicket). Si falla, liberamos el id para permitir reintento.
      let printers: PrinterRecord[] = [];
      try {
        const { data } = await api.get<RawPrinter[]>("/api/printers");
        printers = (Array.isArray(data) ? data : []).map((p) => ({
          ...p,
          printerGroupIds: (p.printerGroups ?? [])
            .map((g) => g?.printerGroup?.id)
            .filter((x): x is string => Boolean(x)),
        }));
      } catch {
        printedRef.current.delete(id);
        return;
      }

      const items = mapItems(order);
      if (items.length === 0) return;

      const ctx = {
        orderNumber: (order.orderNumber as string) ?? null,
        orderType: (order.orderType as string) ?? null,
        tableNumber: (order.tableNumber as string) ?? null,
        customerName: (order.customerName as string) ?? null,
      };

      // 1) Comanda de cocina. printKitchenTickets es no-throw internamente
      //    (cada impresora falla de forma aislada), pero envolvemos por si
      //    acaso para que un error no tumbe la impresión del recibo.
      try {
        await printKitchenTickets(printers, { ...ctx, items });
      } catch {
        /* impresión best-effort */
      }

      // 2) Ticket del cliente en CASHIER.
      try {
        await printCustomerReceipt(printers, {
          ...ctx,
          customerPhone: (order.customerPhone as string) ?? null,
          items,
          subtotal:
            Number(order.subtotal) || items.reduce((s, i) => s + i.price * i.quantity, 0),
          discount: Number(order.discount) || 0,
          tip: Number(order.tip) || 0,
          total: Number(order.total) || 0,
          paymentMethod: (order.paymentMethod as string) ?? null,
        });
      } catch {
        /* impresión best-effort */
      }
    };

    window.addEventListener("tpv:order:new", handler as EventListener);
    return () => window.removeEventListener("tpv:order:new", handler as EventListener);
  }, []);
}

export default useAutoPrintOnline;
