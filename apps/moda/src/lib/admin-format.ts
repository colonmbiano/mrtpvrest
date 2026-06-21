// Formateadores del admin retail (con centavos, a diferencia de lib/money.ts que
// los oculta). Los mockups muestran "$12,540.00", así que aquí van 2 decimales.

export const money = (value: number | string) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(value) || 0);

export const num = (value: number | string) =>
  new Intl.NumberFormat("es-MX").format(Number(value) || 0);
