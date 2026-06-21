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

// ── Ventas (mock, mientras no haya analítica en el backend retail) ────────────
export const ventasSeries = [
  { h: "1 may", hoy: 2400, ayer: 0 }, { h: "5 may", hoy: 6800, ayer: 0 },
  { h: "8 may", hoy: 5200, ayer: 0 }, { h: "12 may", hoy: 9100, ayer: 0 },
  { h: "15 may", hoy: 7600, ayer: 0 }, { h: "19 may", hoy: 12800, ayer: 0 },
  { h: "22 may", hoy: 9400, ayer: 0 }, { h: "26 may", hoy: 11200, ayer: 0 },
  { h: "29 may", hoy: 8700, ayer: 0 },
];
export const paymentMethods = [
  { label: "Tarjeta de crédito", pct: 54.2, amount: 77320, color: "#22c55e" },
  { label: "Tarjeta de débito", pct: 23.1, amount: 32980, color: "#3b82f6" },
  { label: "Efectivo", pct: 15.4, amount: 21980, color: "#f59e0b" },
  { label: "Transferencia", pct: 5.0, amount: 7100, color: "#8b5cf6" },
  { label: "Otros", pct: 2.3, amount: 3300, color: "#94a3b8" },
];
export const salesChannels = [
  { label: "Tienda física", pct: 68.7, amount: 97980, color: "#22c55e" },
  { label: "Tienda en línea", pct: 24.6, amount: 35080, color: "#3b82f6" },
  { label: "Marketplace", pct: 6.7, amount: 9620, color: "#f59e0b" },
];
export type Order = { folio: string; customer: string; date: string; total: number; method: string; status: string };
export const orders: Order[] = [
  { folio: "#VTA-10568", customer: "María Fernanda López", date: "31 may. 2024, 14:32", total: 1250, method: "VISA •••• 4242", status: "Completado" },
  { folio: "#VTA-10567", customer: "Juan Pablo Ramírez", date: "31 may. 2024, 13:18", total: 890, method: "Mastercard •••• 3196", status: "Completado" },
  { folio: "#VTA-10566", customer: "Andrea Martínez", date: "31 may. 2024, 12:05", total: 620, method: "Efectivo", status: "Completado" },
  { folio: "#VTA-10565", customer: "Carlos Díaz", date: "31 may. 2024, 11:47", total: 1560, method: "VISA •••• 8871", status: "En proceso" },
  { folio: "#VTA-10564", customer: "Sofía Hernández", date: "31 may. 2024, 10:22", total: 2340, method: "Transferencia", status: "Completado" },
];

// ── Clientes (mock) ───────────────────────────────────────────────────────────
export type Client = { name: string; email: string; phone: string; last: string; spent: number; tag: string };
export const clients: Client[] = [
  { name: "María Fernanda López", email: "maria.lopez@gmail.com", phone: "+52 55 1234 5678", last: "25 may 2024", spent: 8450, tag: "VIP" },
  { name: "Carlos Ramírez", email: "carlos.ramirez@gmail.com", phone: "+52 55 2345 6789", last: "24 may 2024", spent: 5230, tag: "Frecuente" },
  { name: "Ana Paula García", email: "anapaula.garcia@gmail.com", phone: "+52 55 3456 7890", last: "23 may 2024", spent: 12760, tag: "VIP" },
  { name: "Jorge Morales", email: "jorge.morales@gmail.com", phone: "+52 55 4567 8901", last: "20 may 2024", spent: 3980, tag: "Frecuente" },
  { name: "Lucía Hernández", email: "lucia.hernandez@gmail.com", phone: "+52 55 5678 9012", last: "19 may 2024", spent: 1250, tag: "Nuevo" },
  { name: "Diego Torres", email: "diego.torres@gmail.com", phone: "+52 55 6789 0123", last: "18 may 2024", spent: 4670, tag: "Frecuente" },
  { name: "Sofía Martínez", email: "sofia.martinez@gmail.com", phone: "+52 55 7890 1234", last: "17 may 2024", spent: 9320, tag: "VIP" },
  { name: "Pedro Sánchez", email: "pedro.sanchez@gmail.com", phone: "+52 55 8901 2345", last: "15 may 2024", spent: 890, tag: "Nuevo" },
];
export const clientSegments = [
  { label: "VIP", count: 156, pct: 5.5, color: "#f59e0b" },
  { label: "Frecuentes", count: 892, pct: 31.4, color: "#3b82f6" },
  { label: "Nuevos", count: 284, pct: 10.0, color: "#8b5cf6" },
  { label: "En riesgo", count: 213, pct: 7.5, color: "#f97316" },
  { label: "Inactivos", count: 1300, pct: 45.6, color: "#94a3b8" },
];
export const retention = [
  { label: "Retenidos", pct: 68.3, color: "#22c55e" },
  { label: "Recuperados", pct: 12.7, color: "#4ade80" },
  { label: "Perdidos", pct: 19.0, color: "#e2e8f0" },
];
