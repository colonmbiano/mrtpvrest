import type { Metadata } from 'next'

// Default de Twitter/X para TODO el subárbol /moda. Sin esto, las páginas del
// cluster (que definen openGraph pero no twitter) heredaban el twitter del root
// layout (título/imagen de la home restaurantera) y al compartir en X salía la
// tarjeta equivocada. La IMAGEN la sobreescribe la convención de archivo
// (opengraph-image/twitter-image) por página; aquí solo fijamos card/título/desc.
export const metadata: Metadata = {
  twitter: {
    card: 'summary_large_image',
    title: 'MODA+ · Punto de venta para tu tienda de ropa',
    description:
      'El punto de venta para tiendas de ropa: inventario por talla y color, etiquetas con código de barras y corte de caja.',
  },
}

export default function ModaLayout({ children }: { children: React.ReactNode }) {
  return children
}
