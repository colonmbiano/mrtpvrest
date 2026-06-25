import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'
import { buildMetadata } from '../lib/seo'
import { siteUrl } from './_data/site'
import './globals.css'

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-body',
  display: 'swap',
})

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  ...buildMetadata({
    title: 'Software de Punto de Venta para Restaurantes | MRTPVREST',
    description:
      'Punto de venta para restaurantes que conecta caja, cocina (KDS), delivery, kiosko y administración en tiempo real. Prueba 14 días gratis, sin tarjeta.',
    path: '/',
  }),
  keywords: [
    'punto de venta para restaurantes',
    'software para restaurantes',
    'sistema de punto de venta restaurante',
    'sistema de comandas',
    'KDS cocina',
    'POS restaurante',
    'TPV restaurante',
    'delivery',
    'kiosko autoservicio',
    'México',
    'LATAM',
  ],
  authors: [{ name: 'MRTPVREST' }],
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${outfit.variable} ${jetBrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
