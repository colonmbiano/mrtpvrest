// handoff/tokens.ts
// Design tokens — MRTPV Delivery App v2
// Alineados con el design system del monorepo

export const C = {
  // ── Fondos
  bg:     '#090909',
  surf1:  '#141416',
  surf2:  '#1A1A1D',
  surf3:  '#222226',

  // ── Bordes
  border:       'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.13)',

  // ── Ámbar (CTA principal, totales pendientes)
  amber:     '#FFB84D',
  amberSoft: 'rgba(255,184,77,0.12)',
  amberGlow: '0 16px 48px rgba(255,184,77,0.28)',

  // ── Verde (entregado, cobrado)
  green:     '#88D66C',
  greenSoft: 'rgba(136,214,108,0.12)',
  greenGlow: '0 16px 48px rgba(136,214,108,0.28)',

  // ── Coral (error, no contesta, offline)
  coral:     '#FF5C33',
  coralSoft: 'rgba(255,92,51,0.10)',

  // ── Iris (GPS, tracking, estado listo)
  iris:     '#A78BFA',
  irisSoft: 'rgba(167,139,250,0.12)',

  // ── Advertencia
  warn:     '#F59E0B',
  warnSoft: 'rgba(245,158,11,0.12)',

  // ── Texto
  text:      '#FFFFFF',
  textDim:   'rgba(255,255,255,0.58)',
  textMuted: 'rgba(255,255,255,0.30)',

  // ── Tipografía
  fontDisplay: "'Syne', system-ui, sans-serif",
  fontBody:    "'Outfit', system-ui, sans-serif",
} as const;

// Configuración de estado de órdenes
export const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:    { label: 'Pendiente',          color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.06)' },
  CONFIRMED:  { label: 'Confirmado',         color: C.iris,   bg: C.irisSoft  },
  PREPARING:  { label: 'Preparando',         color: C.warn,   bg: C.warnSoft  },
  READY:      { label: 'Listo para recoger', color: C.iris,   bg: C.irisSoft  },
  ON_THE_WAY: { label: 'En camino',          color: C.amber,  bg: C.amberSoft },
  DELIVERED:  { label: 'Entregado',          color: C.green,  bg: C.greenSoft },
  CANCELLED:  { label: 'Cancelado',          color: C.coral,  bg: C.coralSoft },
};

// Estilos reutilizables
export const S = {
  // Botón primario (ámbar)
  btnPrimary: {
    height: 64, width: '100%', borderRadius: 20, border: 'none',
    background: C.amber, color: '#090909',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 16px 48px rgba(255,184,77,0.28)',
  },

  // Botón de éxito (verde)
  btnSuccess: {
    height: 64, width: '100%', borderRadius: 20, border: 'none',
    background: C.green, color: '#090909',
    fontSize: 12, fontWeight: 700, letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
    boxShadow: '0 16px 48px rgba(136,214,108,0.28)',
  },

  // Botón secundario
  btnSecondary: {
    height: 44, paddingInline: 16, borderRadius: 12,
    border: `1px solid rgba(255,255,255,0.07)`,
    background: '#1A1A1D', color: 'rgba(255,255,255,0.58)',
    fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontFamily: C.fontBody, cursor: 'pointer',
  },

  // Tarjeta base
  card: {
    background: C.surf1, border: `1px solid ${C.border}`,
    borderRadius: 20, padding: '16px',
  },

  // Section label
  sectionLabel: {
    fontSize: 9, fontWeight: 700, color: C.textMuted,
    letterSpacing: '0.2em', textTransform: 'uppercase' as const, marginBottom: 12,
  },

  // Header sticky
  header: {
    position: 'sticky' as const, top: 0, zIndex: 10,
    background: 'rgba(9,9,9,0.92)', backdropFilter: 'blur(24px)',
    borderBottom: `1px solid rgba(255,255,255,0.07)`,
    padding: '10px 16px',
    display: 'flex', alignItems: 'center', gap: 12,
  },

  // Botón de icono en header
  iconBtn: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    border: `1px solid rgba(255,255,255,0.07)`, background: '#141416',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'rgba(255,255,255,0.58)',
  },
} as const;
