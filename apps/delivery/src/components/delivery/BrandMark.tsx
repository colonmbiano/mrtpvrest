'use client';
// BrandMark.tsx — Logo oficial único del Repartidor (Mercadito Colorines).
// Bolsa de mercado "en movimiento": liga el marketplace (Mercadito) con la
// entrega. Blanco sobre degradado naranja de marca (#FA5A20 -> #C6410C).
// Reutilizable para mantener un solo logo en Login, Home y donde haga falta.

interface DeliveryLogoProps {
  size?: number;          // lado del tile en px
  radius?: number;        // radio de esquina (por defecto ~35% del lado)
  glow?: boolean;         // sombra naranja suave (para el logo grande)
}

export function DeliveryLogo({ size = 80, radius, glow = false }: DeliveryLogoProps) {
  const r = radius ?? Math.round(size * 0.34);
  const g = size * 0.62; // lado del glifo
  return (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: 'linear-gradient(145deg, #FA5A20 0%, #C6410C 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
        boxShadow: glow ? '0 22px 56px rgba(198,65,12,0.38)' : '0 8px 20px rgba(198,65,12,0.22)',
      }}
    >
      {/* brillo superior sutil para dar profundidad */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(120% 85% at 28% 12%, rgba(255,255,255,0.26), transparent 55%)',
      }} />
      <svg viewBox="0 0 48 48" width={g} height={g} fill="none"
        style={{ position: 'relative', display: 'block' }}>
        <g stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
          {/* líneas de velocidad */}
          <path d="M4 22 H12" />
          <path d="M2 29.5 H9.5" />
          <path d="M5 37 H12.5" />
          {/* cuerpo de la bolsa de mercado */}
          <path d="M18 18 H36 a3 3 0 0 1 3 3 V39 a3 3 0 0 1 -3 3 H18 a3 3 0 0 1 -3 -3 V21 a3 3 0 0 1 3 -3 Z" />
          {/* asa */}
          <path d="M22 18 V16.5 a5 5 0 0 1 10 0 V18" />
          {/* pliegue superior */}
          <path d="M15 25.5 H39" />
        </g>
      </svg>
    </div>
  );
}
