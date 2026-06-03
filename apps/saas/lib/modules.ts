// lib/modules.ts — Catálogo canónico de módulos por tenant (panel SaaS).
//
// Fuente única para las dos vistas de "Marcas" (lista y detalle), espejo del
// catálogo del backend (apps/backend/src/lib/tenantModules.js). Antes la lista
// leía 3 flags booleanos legacy y el detalle leía enabledModules[], lo que
// producía desync (la lista no mostraba kiosk/loyalty/kds/reports/finance).

export interface ModuleDef {
  key: string;
  label: string;       // etiqueta larga (detalle)
  shortLabel: string;  // etiqueta corta (chips de la lista)
  accent: "orange" | "green" | "blue" | "amber" | "red";
  aliases?: string[];
}

export const MODULE_CATALOG: ModuleDef[] = [
  { key: "inventory", label: "Inventario",         shortLabel: "Inventario", accent: "green"  },
  { key: "delivery",  label: "Reparto / Delivery", shortLabel: "Reparto",    accent: "orange" },
  { key: "webstore",  label: "Tienda Web",         shortLabel: "Tienda Web", accent: "blue", aliases: ["client_menu"] },
  { key: "kiosk",     label: "Kiosko",             shortLabel: "Kiosko",     accent: "amber"  },
  { key: "loyalty",   label: "Lealtad",            shortLabel: "Lealtad",    accent: "red", aliases: ["loyalty_advanced"] },
  { key: "kds",       label: "KDS",                shortLabel: "KDS",        accent: "orange" },
  { key: "reports",   label: "Reportes",           shortLabel: "Reportes",   accent: "blue"   },
  { key: "finance",   label: "Finanzas",           shortLabel: "Finanzas",   accent: "green"  },
];

const ALIAS_TO_CANONICAL: Record<string, string> = {};
for (const m of MODULE_CATALOG) {
  ALIAS_TO_CANONICAL[m.key] = m.key;
  (m.aliases ?? []).forEach((a) => { ALIAS_TO_CANONICAL[a.toLowerCase()] = m.key; });
}

export function toCanonicalKey(raw: string): string | null {
  return ALIAS_TO_CANONICAL[String(raw ?? "").toLowerCase().trim()] ?? null;
}

export interface TenantModuleRow {
  moduleKey: string;
  enabled: boolean;
  requiresPlan?: boolean;
}

export interface TenantModuleLike {
  tenantModules?: TenantModuleRow[] | null;
  enabledModules?: string[] | null;
  hasInventory?: boolean;
  hasDelivery?: boolean;
  hasWebStore?: boolean;
}

/**
 * Set de claves canónicas activas de un tenant. Prefiere la fuente canónica
 * (tenantModules) y cae a los campos legacy mientras dure la migración / si el
 * backfill aún no corrió para ese tenant.
 */
export function activeModuleKeys(t: TenantModuleLike): Set<string> {
  const set = new Set<string>();
  if (Array.isArray(t.tenantModules) && t.tenantModules.length > 0) {
    for (const row of t.tenantModules) {
      if (row.enabled) {
        const k = toCanonicalKey(row.moduleKey);
        if (k) set.add(k);
      }
    }
    return set;
  }
  for (const v of t.enabledModules ?? []) {
    const k = toCanonicalKey(v);
    if (k) set.add(k);
  }
  if (t.hasInventory) set.add("inventory");
  if (t.hasDelivery) set.add("delivery");
  if (t.hasWebStore) set.add("webstore");
  return set;
}

/** enabledModules canónico (excluye 'inventory', que vive como flag) para el panel. */
export function enabledModulesForPanel(t: TenantModuleLike): string[] {
  const set = activeModuleKeys(t);
  return MODULE_CATALOG.filter((m) => m.key !== "inventory" && set.has(m.key)).map((m) => m.key);
}
