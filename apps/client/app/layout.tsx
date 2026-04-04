import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'MRTPVREST — El POS que tu restaurante necesita',
  description:
    'TPV táctil, cocina digital, delivery con GPS y tienda online en una sola plataforma. Sin instalaciones. Desde $2/mes. Prueba 15 días gratis.',
  keywords: 'pos restaurante, sistema punto de venta, tpv restaurante, software restaurante, delivery restaurante',
  openGraph: {
    title: 'MRTPVREST — El POS que tu restaurante necesita',
    description: 'TPV, cocina, delivery y tienda online en una sola plataforma. Desde $2/mes.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
