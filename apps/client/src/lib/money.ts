// Formato de dinero de la tienda. La moneda y el locale salen de la config del
// negocio (RestaurantConfig.currency / currencyLocale), expuestos en /api/store/info.
// Antes el símbolo "$" y "es-MX" estaban hardcodeados en 5 lugares; esta es la
// fuente única. minimumFractionDigits 0 conserva el estilo previo ($100, no $100.00).

export function formatMoney(n: number, currency = "MXN", locale = "es-MX"): string {
  const value = Number(n) || 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    // Locale o código de moneda inválido: respaldo al formato histórico.
    return `$${value.toLocaleString("es-MX", { minimumFractionDigits: 0 })}`;
  }
}
