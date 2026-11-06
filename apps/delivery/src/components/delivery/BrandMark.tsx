'use client';
// BrandMark.tsx — Logo oficial del Repartidor (Mercadito Colorines).
// Muestra el simbolo aprobado (puesto de mercado con toldo) sobre una tarjeta
// blanca, igual que el icono de la app. Un solo logo reutilizable para Login,
// Home y donde haga falta. El PNG oficial vive en /brand-symbol.png.

interface DeliveryLogoProps {
  size?: number;    // lado del tile en px
  radius?: number;  // radio de esquina (por defecto ~34% del lado)
  glow?: boolean;   // sombra suave (para el logo grande)
}

export function DeliveryLogo({ size = 80, radius, glow = false }: DeliveryLogoProps) {
  const r = radius ?? Math.round(size * 0.34);
  return (
    <div
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: '#ffffff', border: '1px solid #E2EAE5',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
        boxShadow: glow
          ? '0 18px 44px rgba(20,116,59,0.16)'
          : '0 4px 14px rgba(23,42,42,0.08)',
      }}
    >
      <div
        role="img"
        aria-label="Mercadito Colorines Repartidor"
        style={{
          width: '72%', height: '72%',
          backgroundImage: 'url(/brand-symbol.png)',
          backgroundSize: 'contain',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
        }}
      />
    </div>
  );
}
