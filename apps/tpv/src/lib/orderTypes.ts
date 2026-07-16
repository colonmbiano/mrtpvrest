// Fuente ÚNICA de verdad para las etiquetas de tipo de orden.
//
// Antes cada pantalla traía su propio mapa y el mismo concepto se mostraba
// distinto en cada superficie ("Delivery" / "Domic." / "Domicilio", "Mesa" /
// "Comer Aquí"…). Eso confundía al cajero. Aquí se definen las TRES variantes
// canónicas y todas las pantallas las importan:
//
//   ACTION  → tarjetas de "iniciar venta" y captura (acción que hace el cajero)
//   BADGE   → chips/badges en MAYÚSCULAS (filas de cuentas, recibos)
//   SHORT   → pestañas y filtros (Title Case compacto)
//
// Si hay que renombrar un tipo, se cambia AQUÍ y se propaga a todo el TPV.

export type OrderTypeId = "DINE_IN" | "TAKEOUT" | "DELIVERY";

// Los mapas se tipan como Record<string,string> a propósito: varias pantallas
// los indexan con el `orderType` crudo del backend (string), y otras acceden
// por propiedad (.DINE_IN). Ambas formas funcionan así sin fricción de tipos.

/** Etiqueta de acción (larga) — cards de iniciar venta / recibo. */
export const ORDER_TYPE_ACTION: Record<string, string> = {
  DINE_IN: "Comer Aquí",
  TAKEOUT: "Para Llevar",
  DELIVERY: "Domicilio",
};

/** Badge en MAYÚSCULAS — filas de cuentas abiertas, recibos, etiquetas. */
export const ORDER_TYPE_BADGE: Record<string, string> = {
  DINE_IN: "MESA",
  TAKEOUT: "LLEVAR",
  DELIVERY: "DOMICILIO",
};

/** Forma corta Title Case — pestañas y filtros del POS. */
export const ORDER_TYPE_SHORT: Record<string, string> = {
  DINE_IN: "Mesa",
  TAKEOUT: "Llevar",
  DELIVERY: "Domicilio",
};

/** Helpers tolerantes a claves desconocidas (caen al propio valor recibido). */
export const orderTypeBadge = (id: string): string =>
  ORDER_TYPE_BADGE[id as OrderTypeId] ?? id;
export const orderTypeAction = (id: string): string =>
  ORDER_TYPE_ACTION[id as OrderTypeId] ?? id;
export const orderTypeShort = (id: string): string =>
  ORDER_TYPE_SHORT[id as OrderTypeId] ?? id;
