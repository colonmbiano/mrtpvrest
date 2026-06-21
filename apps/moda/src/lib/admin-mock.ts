// Datos mock CENTRALIZADOS del admin retail (fallback mientras no haya endpoint).
// Cuando el backend exponga estos datos, se reemplazan aquí en un solo lugar.
// Series deterministas (sin Math.random) para que el SSR sea estable.

export const sparkUp = [4, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16];
export const sparkUp2 = [8, 7, 9, 8, 11, 10, 13, 12, 15, 14, 17, 18];
export const sparkFlat = [10, 9, 11, 10, 12, 11, 10, 12, 11, 13, 12, 14];
export const sparkWarn = [6, 8, 7, 10, 9, 8, 11, 10, 9, 12, 11, 10];

// Ventas del día por hora (curva hoy vs ayer) para la gráfica de Resumen.
export const salesToday = [
  { h: "00:00", hoy: 120, ayer: 90 },
  { h: "02:00", hoy: 260, ayer: 210 },
  { h: "04:00", hoy: 380, ayer: 360 },
  { h: "06:00", hoy: 720, ayer: 640 },
  { h: "08:00", hoy: 1850, ayer: 1500 },
  { h: "10:00", hoy: 3400, ayer: 2900 },
  { h: "12:00", hoy: 4800, ayer: 4200 },
  { h: "14:00", hoy: 6100, ayer: 5200 },
  { h: "16:00", hoy: 7400, ayer: 6300 },
  { h: "18:00", hoy: 8900, ayer: 7600 },
  { h: "20:00", hoy: 10800, ayer: 9100 },
  { h: "23:00", hoy: 12540, ayer: 10570 },
];

export type TopProduct = { rank: number; name: string; sku: string; units: number; total: number };
export const topProducts: TopProduct[] = [
  { rank: 1, name: "Camiseta Oversize Negra", sku: "CAM-001", units: 48, total: 2880 },
  { rank: 2, name: "Jean Slim Fit Azul", sku: "JEA-002", units: 36, total: 3780 },
  { rank: 3, name: "Zapatillas Urban Blancas", sku: "ZAP-003", units: 29, total: 2900 },
  { rank: 4, name: "Chaqueta Denim", sku: "CHA-004", units: 22, total: 4180 },
  { rank: 5, name: "Buzo Hoodie Gris", sku: "BZO-005", units: 18, total: 1620 },
];
