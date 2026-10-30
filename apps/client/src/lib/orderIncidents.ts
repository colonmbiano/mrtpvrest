// Incidencias de ruta para el comprador. Vienen persistidas del backend
// (DeliveryIncident, vía GET /api/store/customer/orders) con campos seguros:
// tipo, hora y llamadas. El texto libre del repartidor nunca llega aquí, así
// que cada tipo se traduce a un mensaje fijo. Módulo puro y sin imports para
// probarlo con Node.

export type CustomerOrderIncident = {
  id: string;
  type: string; // CUSTOMER_UNREACHABLE | WRONG_ADDRESS | DAMAGED_OR_REJECTED
  occurredAt: string; // ISO
  callAttempts: number;
};

export type IncidentView = {
  id: string;
  title: string;
  detail: string;
  time: string | null; // HH:mm local; null si la fecha no es válida
  resolved: boolean;
};

type OrderLike = { orderType: string; status: string; incidents?: CustomerOrderIncident[] | null };

function timeOf(iso: string, timeZone?: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone });
}

function copyFor(incident: CustomerOrderIncident): { title: string; detail: string } {
  switch (incident.type) {
    case 'CUSTOMER_UNREACHABLE':
      return {
        title: 'El repartidor no pudo contactarte',
        detail: incident.callAttempts > 0
          ? `Intentó llamarte ${incident.callAttempts} ${incident.callAttempts === 1 ? 'vez' : 'veces'}. Revisa tu teléfono.`
          : 'Revisa tu teléfono; volverá a intentarlo.',
      };
    case 'WRONG_ADDRESS':
      return {
        title: 'Hay un problema con la dirección',
        detail: 'El repartidor no encontró la dirección de entrega. Revisa que esté completa.',
      };
    case 'DAMAGED_OR_REJECTED':
      return {
        title: 'Hubo un problema con tu pedido',
        detail: 'La tienda se pondrá en contacto contigo para resolverlo.',
      };
    default:
      return {
        title: 'El repartidor reportó un problema',
        detail: 'La tienda se pondrá en contacto contigo si hace falta.',
      };
  }
}

// Solo pedidos a domicilio tienen incidencias de ruta. Son auditoría inmutable
// (no tienen estado propio): se dan por resueltas cuando el pedido se entregó.
export function incidentViews(order: OrderLike, { timeZone }: { timeZone?: string } = {}): IncidentView[] {
  if (order.orderType !== 'DELIVERY' || !Array.isArray(order.incidents)) return [];
  const resolved = order.status === 'DELIVERED';
  return order.incidents.map((incident) => ({
    id: incident.id,
    ...copyFor(incident),
    time: timeOf(incident.occurredAt, timeZone),
    resolved,
  }));
}
