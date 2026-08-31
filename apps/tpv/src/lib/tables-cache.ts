// ── Caché local de Mesas y Zonas de Sala (Stale-While-Revalidate) ─────────────
// Permite que la vista de mesas y meseros cargue de inmediato (0ms) y
// continúe funcionando sin pantalla en blanco ante fallos de red o caídas
// del servidor backend / base de datos.
import { get, set } from 'idb-keyval';

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

export const TABLES_CACHE_KEY = "tpv-tables-cache-v2";

export async function readTablesCache(): Promise<TablesCache | null> {
  if (typeof window === "undefined") return null;
  try {
    const data = await get(TABLES_CACHE_KEY);
    if (!data || !Array.isArray(data?.tables) || !Array.isArray(data?.zones)) return null;
    return data as TablesCache;
  } catch {
    return null;
  }
}

export async function writeTablesCache(tables: TableRow[], zones: Zone[]): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const data: TablesCache = {
      tables,
      zones,
      fetchedAt: Date.now(),
    };
    await set(TABLES_CACHE_KEY, data);
  } catch {
    /* Cuota llena / modo privado: almacenamiento best-effort */
  }
}

export async function patchTablesCacheTable(
  tableId: string,
  patch: Partial<TableRow>
): Promise<void> {
  const cache = await readTablesCache();
  if (!cache) return;
  const updatedTables = cache.tables.map((t) =>
    t.id === tableId ? { ...t, ...patch } : t
  );
  await writeTablesCache(updatedTables, cache.zones);
}
