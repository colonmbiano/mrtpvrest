/**
 * Formateadores centralizados del admin (es-MX).
 * `money` ya existe en components/warmtech para uso interno del design-system;
 * estos exponen variantes con/ sin decimales para las pantallas retail.
 */
export const formatMoney = (value: number, withCents = true) =>
  new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  }).format(Number.isFinite(value) ? value : 0);

export const formatNumber = (value: number) =>
  new Intl.NumberFormat("es-MX").format(Number.isFinite(value) ? value : 0);

export const formatPercent = (value: number, digits = 1) =>
  `${(Number.isFinite(value) ? value : 0).toFixed(digits)}%`;
