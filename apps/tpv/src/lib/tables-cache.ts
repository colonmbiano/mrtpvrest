// ── Caché local de Mesas y Zonas de Sala (Stale-While-Revalidate) ─────────────
// Permite que la vista de mesas y meseros cargue de inmediato (0ms) y
// continúe funcionando sin pantalla en blanco ante fallos de red o caídas
// del servidor backend / base de datos.

export interface ActiveOrderLite {
  id: string;
  orderNumber?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  total: number;
  customerName?: string | null;
  createdAt?: string | null;
  _count?: { items: number };
}

export type ZoneRef = { id: string; name: string; icon: string | null };

export interface TableRow {
  id: string;
  name: string;
  status: "AVAILABLE" | "OCCUPIED" | "DIRTY";
  zoneId: string | null;
  zone: ZoneRef | null;
  capacity?: number;
  activeOrder: ActiveOrderLite | null;
}

export interface Zone extends ZoneRef {
  order: number;
  tablesCount: number;
}

export interface TablesCache {
  tables: TableRow[];
  zones: Zone[];
  fetchedAt: number;
}

export const TABLES_CACHE_KEY = "tpv-tables-cache-v1";

export function readTablesCache(): TablesCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TABLES_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.tables) || !Array.isArray(parsed?.zones)) return null;
    return parsed as TablesCache;
  } catch {
    return null;
  }
}

export function writeTablesCache(tables: TableRow[], zones: Zone[]): void {
  if (typeof window === "undefined") return;
  try {
    const data: TablesCache = {
      tables,
      zones,
      fetchedAt: Date.now(),
    };
    window.localStorage.setItem(TABLES_CACHE_KEY, JSON.stringify(data));
  } catch {
    /* Cuota llena / modo privado: almacenamiento best-effort */
  }
}

export function patchTablesCacheTable(
  tableId: string,
  patch: Partial<TableRow>
): void {
  const cache = readTablesCache();
  if (!cache) return;
  const updatedTables = cache.tables.map((t) =>
    t.id === tableId ? { ...t, ...patch } : t
  );
  writeTablesCache(updatedTables, cache.zones);
}
