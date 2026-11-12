export interface HistoryOrder {
  id: string;
  orderNumber: string;
  status: string;
  source: string;
  orderType: string;
  createdAt: string;
  updatedAt: string;
  awaitingTableConfirmation: boolean;
  tableNumber?: number | null;
  table?: { name: string } | null;
  notes?: string | null;
  items: Array<{ id: string; name: string; quantity: number; notes?: string | null;
    modifiers: Array<{ name: string }>; comboSelections: Array<{ name: string }> }>;
}

const STATES: Record<string, { label: string; tone: string; explanation: string }> = {
  PENDING_PAYMENT: { label: 'Esperando pago', tone: 'text-amber-200', explanation: 'Aún no está disponible para preparar.' },
  PENDING_MERCHANT: { label: 'Por aceptar en caja', tone: 'text-amber-200', explanation: 'La caja debe aceptar el pedido antes de enviarlo a cocina.' },
  PENDING: { label: 'Pendiente', tone: 'text-amber-200', explanation: 'Consulta la cola de cocina para ver el trabajo pendiente.' },
  OPEN: { label: 'Cuenta abierta', tone: 'text-sky-200', explanation: 'La mesa puede añadir más rondas. Consulta la cola de cocina.' },
  CONFIRMED: { label: 'Aceptado · por preparar', tone: 'text-sky-200', explanation: 'Consulta la estación correspondiente en cocina.' },
  PREPARING: { label: 'En preparación', tone: 'text-sky-200', explanation: 'Consulta la estación correspondiente en cocina.' },
  PACKING: { label: 'En empaque', tone: 'text-violet-200', explanation: 'La preparación terminó y falta verificar el empaque.' },
  READY: { label: 'Listo', tone: 'text-green-200', explanation: 'El pedido ya salió de la preparación.' },
  ON_THE_WAY: { label: 'En reparto', tone: 'text-green-200', explanation: 'El pedido está en camino.' },
  DELIVERED: { label: 'Entregado', tone: 'text-green-200', explanation: 'Este pedido ya terminó.' },
  CANCELLED: { label: 'Cancelado', tone: 'text-red-200', explanation: 'No se debe preparar. Se conserva para consulta.' },
};

export function historyState(order: Pick<HistoryOrder, 'status' | 'awaitingTableConfirmation'>) {
  if (order.awaitingTableConfirmation && !['CANCELLED', 'DELIVERED'].includes(order.status)) {
    return { label: 'Por confirmar en caja', tone: 'text-amber-200', explanation: 'La caja debe confirmar el pedido de mesa antes de prepararlo.' };
  }
  return STATES[order.status] || { label: 'Estado no disponible', tone: 'text-white', explanation: 'Actualiza el historial para consultar el estado.' };
}

export function historyChannel(source: string) {
  return ({ MARKETPLACE: 'Mercadito', ONLINE: 'Pedido en línea', WHATSAPP: 'WhatsApp', TPV: 'Caja', POS: 'Caja' } as Record<string, string>)[source] || source;
}
