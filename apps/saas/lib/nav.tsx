// lib/nav.tsx — Fuente ÚNICA de la navegación del panel SaaS.
//
// La consumen el Sidebar (desktop), el MobileTopBar (drawer móvil) y el
// MobileTabBar (barra inferior). Antes cada componente hardcodeaba su propio
// array de rutas y ya habían divergido (p.ej. "Demos" existía en el sidebar
// pero NO en el drawer móvil, quedando inalcanzable en celular). Centralizar
// evita ese drift: agregar/quitar una pantalla se hace en un solo lugar.

import type { SVGProps, ComponentType } from "react";

type Ico = ComponentType<SVGProps<SVGSVGElement>>;

// ── Iconos (viewBox 16, tamaño controlable vía props width/height) ──────────
const svgBase = {
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  width: 16,
  height: 16,
};

export const IconGrid: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <rect x="1" y="1" width="6" height="6" rx="1" />
    <rect x="9" y="1" width="6" height="6" rx="1" />
    <rect x="1" y="9" width="6" height="6" rx="1" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </svg>
);
export const IconStar: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M8 1.5l1.8 4.2 4.5.4-3.3 3 1 4.4L8 11.2l-4 2.3 1-4.4-3.3-3 4.5-.4z" />
  </svg>
);
export const IconRocket: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M8 1.5c2.2 1 3.5 3.2 3.5 6 0 1.3-.4 2.6-1 3.5H5.5c-.6-.9-1-2.2-1-3.5 0-2.8 1.3-5 3.5-6z" />
    <path d="M6 11c-1.3.4-2 1.5-2 3 1.5 0 2.6-.7 3-2M10 11c1.3.4 2 1.5 2 3-1.5 0-2.6-.7-3-2" />
    <circle cx="8" cy="6.5" r="1.1" />
  </svg>
);
export const IconSettings: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3" />
  </svg>
);
export const IconReceipt: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M3 2.5h10a.5.5 0 01.5.5v11l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5V3a.5.5 0 01.5-.5z" />
    <line x1="5" y1="6.5" x2="11" y2="6.5" />
    <line x1="5" y1="9.5" x2="8" y2="9.5" />
  </svg>
);
export const IconTerminal: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M2 4h12a1 1 0 011 1v6a1 1 0 01-1 1H2a1 1 0 01-1-1V5a1 1 0 011-1z" />
    <path d="M4 8l2-2-2-2M8 10h3" />
  </svg>
);
export const IconAlert: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <path d="M8 1.5L1.5 13.5h13z" />
    <line x1="8" y1="6" x2="8" y2="9.5" />
    <circle cx="8" cy="11.5" r="0.6" fill="currentColor" />
  </svg>
);
export const IconKey: Ico = (p) => (
  <svg {...svgBase} {...p}>
    <circle cx="6.5" cy="6.5" r="3.5" />
    <path d="M9.5 9.5L14 14M12 12.5v2M10.5 14h2" />
  </svg>
);

// ── Estructura ──────────────────────────────────────────────────────────────
export interface NavItem {
  href: string;
  label: string;        // etiqueta larga (sidebar / drawer)
  short?: string;       // etiqueta corta (tab bar inferior); default = label
  Icon: Ico;
  primary?: boolean;    // aparece en la tab bar inferior de móvil
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: "/dashboard", label: "Vista general", short: "Inicio", Icon: IconGrid, primary: true },
    ],
  },
  {
    title: "Negocio",
    items: [
      { href: "/marcas",      label: "Marcas",      Icon: IconStar,     primary: true },
      { href: "/demos",       label: "Demos",       Icon: IconRocket,   primary: true },
      { href: "/planes",      label: "Planes",      Icon: IconSettings },
      { href: "/facturacion", label: "Facturación", short: "Facturas", Icon: IconReceipt, primary: true },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/tpv-config",  label: "TPV Config",     Icon: IconTerminal },
      { href: "/tpv-updates", label: "TPV Updates",    Icon: IconTerminal },
      { href: "/logs",        label: "Logs / Alertas", Icon: IconTerminal },
      { href: "/errors",      label: "Errores",        Icon: IconAlert },
      { href: "/api-keys",    label: "API Keys",       Icon: IconKey },
    ],
  },
];

// Lista plana de todas las rutas (útil para lookups).
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

// Destinos de la barra inferior de móvil (máx 4; el 5º slot es "Menú").
export const PRIMARY_TABS: NavItem[] = NAV_ITEMS.filter((i) => i.primary).slice(0, 4);
