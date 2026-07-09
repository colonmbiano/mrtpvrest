import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bike,
  Boxes,
  Home,
  Megaphone,
  ReceiptText,
  Settings,
  Store,
  Users,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";

/**
 * Fuente única de navegación del panel admin tenant.
 * La consumen Sidebar (desktop), MobileAdminChrome (bottom-nav + sheet "Más"),
 * AdminTopbar (título/breadcrumb + buscador ⌘K) y PageTabs (tabs de hub).
 * Las URLs son las históricas: aquí solo se reorganiza cómo se presentan.
 */

export type NavItem = {
  href: string;
  label: string;
  /** Título del header de página; default = label. */
  title?: string;
  subtitle?: string;
  /** "exact" no se activa en subrutas (p.ej. /admin/menu vs /admin/menu/fotos). */
  match?: "exact" | "prefix";
  badge?: "live";
};

export type NavGroup = {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV_TOP: (NavItem & { icon: LucideIcon })[] = [
  { href: "/admin", label: "Inicio", icon: Home, match: "exact", subtitle: "Resumen de hoy" },
  { href: "/admin/pedidos", label: "Pedidos", icon: ReceiptText, badge: "live", subtitle: "Operación en vivo" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    key: "reportes",
    label: "Reportes",
    icon: BarChart3,
    items: [
      { href: "/admin/reportes/ia", label: "Reportes IA", subtitle: "Mesero analiza tu negocio" },
      { href: "/admin/reportes/dimensiones", label: "Por dimensión", subtitle: "Canal, variantes, extras y combos" },
      { href: "/admin/reportes/cortes", label: "Cortes de caja", subtitle: "Cierres y liquidaciones" },
      { href: "/admin/reportes/repartidores", label: "Repartidores", subtitle: "Rendimiento de reparto" },
      { href: "/admin/ventas/importar", label: "Importar ventas", subtitle: "Historial desde CSV" },
    ],
  },
  {
    key: "menu",
    label: "Menú",
    icon: UtensilsCrossed,
    items: [
      { href: "/admin/menu", label: "Platillos", match: "exact", subtitle: "Productos, combos y precios" },
      { href: "/admin/menu/categorias", label: "Categorías", subtitle: "Orden del menú" },
      { href: "/admin/menu/variantes", label: "Variantes", subtitle: "Plantillas reutilizables" },
      { href: "/admin/menu/fotos", label: "Fotos", subtitle: "Imágenes de productos" },
    ],
  },
  {
    key: "inventario",
    label: "Inventario",
    icon: Boxes,
    items: [
      { href: "/admin/inventario", label: "Stock e insumos", match: "exact", subtitle: "Existencias y alertas" },
      { href: "/admin/inventario/compras", label: "Compras & bodega", subtitle: "Entradas y transferencias" },
      { href: "/admin/inventario/recetas", label: "Recetas", subtitle: "Costeo por platillo" },
      { href: "/admin/inventario/subrecetas", label: "Subrecetas", subtitle: "Preparaciones base" },
      { href: "/admin/inventario/extras", label: "Extras", subtitle: "Modificadores con receta" },
      { href: "/admin/inventario/proveedores", label: "Proveedores", subtitle: "Directorio de compra" },
    ],
  },
  {
    key: "finanzas",
    label: "Finanzas",
    icon: Wallet,
    items: [
      { href: "/admin/finanzas", label: "Food cost", match: "exact", subtitle: "Costo vs venta por platillo" },
      { href: "/admin/finanzas/flujo", label: "Flujo de caja", subtitle: "Entradas y salidas" },
      // Rutas históricas bajo /admin/inventario/* — solo se recolocan en el nav.
      { href: "/admin/inventario/gastos", label: "Gastos", subtitle: "Resumen y detalle diario" },
      { href: "/admin/inventario/por-pagar", label: "Cuentas por pagar", subtitle: "Deudas con proveedores" },
      { href: "/admin/inventario/recurrentes", label: "Pagos recurrentes", subtitle: "Renta, servicios, suscripciones" },
      { href: "/admin/finanzas/conciliacion", label: "Conciliación SPEI", subtitle: "Transferencias por verificar" },
    ],
  },
  {
    key: "personal",
    label: "Personal",
    icon: Users,
    items: [
      { href: "/admin/empleados", label: "Empleados", subtitle: "Equipo y permisos" },
      { href: "/admin/nomina", label: "Nómina", subtitle: "La raya: pago por día trabajado" },
      { href: "/admin/turnos", label: "Turnos de caja", subtitle: "Control operativo" },
    ],
  },
  {
    key: "reparto",
    label: "Reparto",
    icon: Bike,
    items: [
      { href: "/admin/caja-repartidores", label: "Caja repartidores", subtitle: "Liquidaciones y efectivo" },
      { href: "/admin/zonas", label: "Zonas de entrega", subtitle: "Polígonos y tarifa por zona" },
      { href: "/admin/rastreo", label: "Rastreo GPS", subtitle: "Ubicación en vivo" },
      { href: "/admin/logistica", label: "Logística & flota", subtitle: "Vehículos y viajes" },
    ],
  },
  {
    key: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { href: "/admin/promociones", label: "Promociones IA", subtitle: "Campañas y rendimiento" },
      { href: "/admin/promociones-3x2", label: "Promos NxM", subtitle: "3x2 y descuentos por volumen" },
      { href: "/admin/banners", label: "Banners", subtitle: "Promociones visuales" },
      { href: "/admin/whatsapp", label: "WhatsApp", subtitle: "Bot, campañas y contactos" },
      { href: "/admin/inbox", label: "Bandeja de entrada", subtitle: "Conversaciones y handoff humano" },
      { href: "/admin/plantillas", label: "Plantillas WA", subtitle: "Mensajes aprobados por Meta" },
      { href: "/admin/pantalla-cliente", label: "Pantalla cliente", subtitle: "Display de pedidos del TPV" },
    ],
  },
  {
    key: "tienda",
    label: "Tienda online",
    icon: Store,
    items: [
      { href: "/admin/tienda", label: "Tienda y lealtad", subtitle: "Cupones, puntos y recompensas" },
    ],
  },
  {
    key: "config",
    label: "Configuración",
    icon: Settings,
    items: [
      { href: "/admin/mi-marca", label: "Mi marca", subtitle: "Identidad y sucursales" },
      { href: "/admin/integraciones", label: "Integraciones", subtitle: "Servicios conectados" },
      { href: "/admin/modulos", label: "Módulos", subtitle: "Funciones del negocio" },
      { href: "/admin/billing", label: "Facturación y plan", subtitle: "Suscripción y pagos" },
      { href: "/admin/mi-cuenta", label: "Mi Cuenta", subtitle: "Perfil, región y apariencia" },
      { href: "/admin/descargas", label: "Apps & descargas", subtitle: "Herramientas del equipo" },
      { href: "/admin/guias", label: "Guías de uso", subtitle: "Aprende a sacarle jugo" },
    ],
  },
];

/** Bottom-nav móvil; el resto de grupos se muestran en el sheet "Más". */
export const MOBILE_TABS: (NavItem & { icon: LucideIcon })[] = [
  { href: "/admin", label: "Inicio", icon: Home, match: "exact" },
  { href: "/admin/pedidos", label: "Pedidos", icon: ReceiptText },
  { href: "/admin/menu", label: "Menú", icon: UtensilsCrossed },
  { href: "/admin/reportes/ia", label: "Reportes", icon: BarChart3 },
];

/** Tabs de hub renderizadas por <PageTabs set="..."> bajo el header de página. */
export const TAB_SETS = {
  reportes: [
    { label: "IA", href: "/admin/reportes/ia" },
    { label: "Dimensiones", href: "/admin/reportes/dimensiones" },
    { label: "Cortes", href: "/admin/reportes/cortes" },
    { label: "Repartidores", href: "/admin/reportes/repartidores" },
  ],
  menu: [
    { label: "Platillos", href: "/admin/menu" },
    { label: "Categorías", href: "/admin/menu/categorias" },
    { label: "Variantes", href: "/admin/menu/variantes" },
    { label: "Fotos", href: "/admin/menu/fotos" },
  ],
  inventario: [
    { label: "Stock", href: "/admin/inventario" },
    { label: "Compras", href: "/admin/inventario/compras" },
    { label: "Recetas", href: "/admin/inventario/recetas" },
    { label: "Subrecetas", href: "/admin/inventario/subrecetas" },
    { label: "Extras", href: "/admin/inventario/extras" },
    { label: "Proveedores", href: "/admin/inventario/proveedores" },
  ],
  finanzas: [
    { label: "Food cost", href: "/admin/finanzas" },
    { label: "Flujo", href: "/admin/finanzas/flujo" },
    { label: "Gastos", href: "/admin/inventario/gastos" },
    { label: "Por pagar", href: "/admin/inventario/por-pagar" },
    { label: "Recurrentes", href: "/admin/inventario/recurrentes" },
    { label: "Conciliación", href: "/admin/finanzas/conciliacion" },
  ],
} as const;

export type TabSetKey = keyof typeof TAB_SETS;

export function isNavItemActive(item: Pick<NavItem, "href" | "match">, pathname: string): boolean {
  if (item.match === "exact") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

const ALL_ITEMS: { item: NavItem; group?: NavGroup }[] = [
  ...NAV_TOP.map((item) => ({ item: item as NavItem })),
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ item, group }))),
];

/** Item + grupo activos para un pathname (el match más específico gana). */
export function matchNav(pathname: string): { item?: NavItem; group?: NavGroup } {
  let best: { item?: NavItem; group?: NavGroup } = {};
  let bestLen = -1;
  for (const entry of ALL_ITEMS) {
    if (isNavItemActive(entry.item, pathname) && entry.item.href.length > bestLen) {
      best = entry;
      bestLen = entry.item.href.length;
    }
  }
  return best;
}

/** Título/subtítulo de página para topbar desktop y header móvil. */
export function routeTitle(pathname: string): { title: string; subtitle?: string; group?: string } | undefined {
  const { item, group } = matchNav(pathname);
  if (!item) return undefined;
  return { title: item.title ?? item.label, subtitle: item.subtitle, group: group?.label };
}
