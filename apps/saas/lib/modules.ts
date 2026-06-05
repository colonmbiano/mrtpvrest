// lib/modules.ts — Catálogo canónico de módulos por tenant (panel SaaS).
//
// ÚNICA fuente de verdad de los módulos en apps/saas: la consumen la LISTA
// (marcas/page.tsx, chips), el DETALLE (marcas/[id]/page.tsx) y el panel de
// toggles (components/TenantModulesPanel.tsx). No redefinir el catálogo en
// otro lado del frontend.
//
// Espejo del catálogo del backend (apps/backend/src/lib/tenantModules.js):
// mantener key/aliases/kind/planFlag en sync entre ambos. Antes la lista leía
// 3 flags booleanos legacy y el detalle leía enabledModules[], lo que producía
// desync (la lista no mostraba kiosk/loyalty/kds/reports/finance).

import {
  Boxes, Truck, Globe, MonitorSmartphone, Heart, ChefHat, BarChart3, Wallet,
  type LucideIcon,
} from "lucide-react";

export type Accent = "orange" | "green" | "blue" | "amber" | "red";

export interface ModuleDef {
  key: string;
  label: string;        // etiqueta larga (detalle / panel)
  shortLabel: string;   // etiqueta corta (chips de la lista)
  description: string;  // descripción (tarjeta del panel de detalle)
  Icon: LucideIcon;
  accent: Accent;
  // "flag" → solo booleano del Tenant (no vive en enabledModules[], p.ej. inventory).
  // "key"  → módulo opcional en enabledModules[], puede estar gated por plan.
  kind: "flag" | "key";
  flag?: "hasInventory";                          // solo kind "flag"
  aliases?: string[];                             // claves históricas equivalentes
  planFlag?: "hasKDS" | "hasLoyalty" | "hasReports"; // booleano del Plan que también lo habilita
}

export const MODULE_CATALOG: ModuleDef[] = [
  { key: "inventory", label: "Inventario",         shortLabel: "Inventario", description: "Control de stock, recetas y mermas.",        Icon: Boxes,             accent: "green",  kind: "flag", flag: "hasInventory" },
  { key: "delivery",  label: "Reparto / Delivery", shortLabel: "Reparto",    description: "Repartidores y pedidos a domicilio.",        Icon: Truck,             accent: "orange", kind: "key" },
  { key: "webstore",  label: "Tienda Web",         shortLabel: "Tienda Web", description: "Menú y pedidos online para el cliente final.", Icon: Globe,             accent: "blue",   kind: "key", aliases: ["client_menu"] },
  { key: "kiosk",     label: "Kiosko",             shortLabel: "Kiosko",     description: "Autoservicio en pantalla para el comensal.",  Icon: MonitorSmartphone, accent: "amber",  kind: "key" },
  { key: "loyalty",   label: "Lealtad",            shortLabel: "Lealtad",    description: "Puntos, recompensas y fidelización.",         Icon: Heart,             accent: "red",    kind: "key", aliases: ["loyalty_advanced"], planFlag: "hasLoyalty" },
  { key: "kds",       label: "KDS",                shortLabel: "KDS",        description: "Pantalla de cocina (Kitchen Display).",       Icon: ChefHat,           accent: "orange", kind: "key", planFlag: "hasKDS" },
  { key: "reports",   label: "Reportes",           shortLabel: "Reportes",   description: "Analítica avanzada y exportaciones.",         Icon: BarChart3,         accent: "blue",   kind: "key", planFlag: "hasReports" },
  { key: "finance",   label: "Finanzas",           shortLabel: "Finanzas",   description: "Gastos, compras y cortes de caja.",           Icon: Wallet,            accent: "green",  kind: "key" },
];

const ALIAS_TO_CANONICAL: Record<string, string> = {};
for (const m of MODULE_CATALOG) {
  ALIAS_TO_CANONICAL[m.key] = m.key;
  (m.aliases ?? []).forEach((a) => { ALIAS_TO_CANONICAL[a.toLowerCase()] = m.key; });
}

export function toCanonicalKey(raw: string): string | null {
  return ALIAS_TO_CANONICAL[String(raw ?? "").toLowerCase().trim()] ?? null;
}

/** Claves de plan que habilitan un módulo (clave canónica + alias). */
export function planKeysFor(def: ModuleDef): string[] {
  return [def.key, ...(def.aliases ?? [])];
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
