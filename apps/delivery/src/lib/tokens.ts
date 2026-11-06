// handoff/tokens.ts
// Design tokens — MRTPV Delivery App
// Tema CLARO alineado con la Guía de Diseño "Mercadito Colorines / Repartidor"
// y con el marketplace cliente (mismo sistema visual verde/naranja).

export const C = {
  // ── Fondos (tema claro)
  bg:     '#F7F9F8', // fondo general
  surf1:  '#FFFFFF', // superficie / tarjeta
  surf2:  '#F2F5F3', // superficie sutil
  surf3:  '#EAEFEC', // superficie hundida / chips

  // ── Bordes / divisores
  border:       '#D6E2DA',
  borderStrong: '#C2D2C8',

  // ── Naranja de acción (CTA con texto blanco) y acentos de marca
  // #C6410C da 5.04:1 sobre blanco (AA). El naranja de marca #FA5A20
  // (3.21:1) solo se usa como tinte suave, nunca como texto pequeño.
  amber:     '#C6410C',
  amberSoft: 'rgba(250,90,32,0.10)',
  amberGlow: '0 12px 28px rgba(198,65,12,0.18)',

  // ── Verde de marca (entregado, cobrado, selección)
  green:     '#14743B',
  greenSoft: '#E8F4EC',
  greenGlow: '0 12px 28px rgba(20,116,59,0.16)',

  // ── Rojo (error, no contesta, offline)
  coral:     '#B42318',
  coralSoft: '#FBECEC',

  // ── Azul informativo (GPS, tracking, estado listo)
  iris:     '#1D4ED8',
  irisSoft: '#E6ECFB',

  // ── Advertencia
  warn:     '#B45309',
  warnSoft: '#FBF0E0',

  // ── Texto
  text:      '#172A2A', // principal
  textDim:   '#52665B', // secundario
  textMuted: '#8A9A90', // metadatos / deshabilitado

  // ── Tipografía
  fontDisplay: "'Syne', system-ui, sans-serif",
  fontBody:    "'Outfit', system-ui, sans-serif",
} as const;

// Configuración de estado de órdenes
export const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:    { label: 'Pendiente',          color: C.textMuted, bg: C.surf3     },
  CONFIRMED:  { label: 'Confirmado',         color: C.iris,      bg: C.irisSoft  },
  PREPARING:  { label: 'Preparando',         color: C.warn,      bg: C.warnSoft  },
  READY:      { label: 'Listo para recoger', color: C.iris,      bg: C.irisSoft  },
  ON_THE_WAY: { label: 'En camino',          color: C.amber,     bg: C.amberSoft },
  DELIVERED:  { label: 'Entregado',          color: C.green,     bg: C.greenSoft },
  CANCELLED:  { label: 'Cancelado',          color: C.coral,     bg: C.coralSoft },
};

// Estilos reutilizables
export const S = {
  // Botón primario (naranja de acción, texto blanco)
  btnPrimary: {
    height: 64, width: '100%', borderRadius: 16, border: 'none',
    background: C.amber, color: '#FFFFFF',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: C.amberGlow,
  },

  // Botón de éxito (verde, texto blanco)
  btnSuccess: {
    height: 64, width: '100%', borderRadius: 16, border: 'none',
    background: C.green, color: '#FFFFFF',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: C.greenGlow,
  },

  // Botón secundario
  btnSecondary: {
    height: 44, paddingInline: 16, borderRadius: 12,
    border: `1px solid ${C.border}`,
    background: C.surf1, color: C.textDim,
    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
  },

  // Tarjeta base
  card: {
    background: C.surf1, border: `1px solid ${C.border}`,
    borderRadius: 16, padding: '16px',
    boxShadow: '0 1px 2px rgba(23,42,42,0.04)',
  },

  // Section label
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: C.textMuted,
    letterSpacing: '0.2em', textTransform: 'uppercase' as const, marginBottom: 12,
  },

  // Header sticky
  header: {
    position: 'sticky' as const, top: 0, zIndex: 10,
    background: 'rgba(247,249,248,0.92)', backdropFilter: 'blur(24px)',
    borderBottom: `1px solid ${C.border}`,
    padding: '10px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },

  // Botón de icono en header
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    border: `1px solid ${C.border}`, background: C.surf1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: C.textDim,
  },
} as const;
