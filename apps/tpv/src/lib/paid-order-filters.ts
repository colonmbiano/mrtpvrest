// Grupos compartidos por la pantalla de cuentas y el cajón de tickets.
// Mantiene los mismos métodos equivalentes en ambas vistas de Cobradas.
export const PAY_FILTERS: { key: string; label: string; methods: string[] | null }[] = [
  { key: "Todos", label: "Todos", methods: null },
  { key: "CASH", label: "Efectivo", methods: ["CASH", "CASH_ON_DELIVERY"] },
  { key: "TRANSFER", label: "Transfer.", methods: ["TRANSFER", "SPEI", "OXXO"] },
  { key: "CARD", label: "Tarjeta", methods: ["CARD", "CARD_PRESENT"] },
  { key: "OTHER", label: "Otros", methods: ["ONLINE", "MIXED", "COURTESY", "OTHER"] },
];

export function matchesPayFilter(
  order: { paymentMethod?: string | null },
  payKey: string,
): boolean {
  const group = PAY_FILTERS.find((p) => p.key === payKey);
  if (!group || group.methods === null) return true;
  return group.methods.includes((order.paymentMethod || "").toUpperCase());
}
