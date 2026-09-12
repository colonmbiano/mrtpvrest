/** Los precios del menú Tokki son finales: el desglose nunca aumenta el cobro. */
export function includedTaxTotals(amount: number, rate: number) {
  const total = Math.round(amount * 100) / 100;
  const validRate = Number.isFinite(rate) ? Math.max(0, Math.min(30, rate)) : 0;
  const subtotal = Math.round(total / (1 + validRate / 100) * 100) / 100;
  return { total, subtotal, tax: Math.round((total - subtotal) * 100) / 100 };
}
