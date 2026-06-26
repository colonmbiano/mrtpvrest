import { ImageResponse } from 'next/og'

export const alt = 'MODA+ — Punto de venta para tu tienda de ropa'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Imagen social propia de MODA+ (ropa). Sin esto, /moda heredaba el logo de
// restaurante del layout raíz. Texto-only para evitar dependencias de fuentes
// o imágenes externas en el render de Satori.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#ffffff',
          padding: '72px',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            fontSize: 30,
            fontWeight: 700,
            color: '#15803d',
          }}
        >
          <div style={{ display: 'flex', width: 16, height: 40, borderRadius: 6, background: '#22c55e' }} />
          MODA+ · Punto de venta para ropa
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ display: 'flex', fontSize: 68, fontWeight: 800, color: '#0f172a', lineHeight: 1.05 }}>
            El punto de venta para tu tienda de ropa
          </div>
          <div style={{ display: 'flex', fontSize: 32, color: '#475569' }}>
            Inventario por talla y color · Etiquetas con código de barras · Corte de caja
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: '#22c55e',
              color: '#ffffff',
              fontSize: 28,
              fontWeight: 700,
              padding: '14px 28px',
              borderRadius: 999,
            }}
          >
            Prueba gratis · Sin tarjeta
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#64748b' }}>Windows · Android · Web</div>
        </div>
      </div>
    ),
    { ...size },
  )
}
