import type { Metadata } from 'next'
import { JetBrains_Mono, Outfit } from 'next/font/google'
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
  metadataBase: new URL('https://mrtpvrest.com'),
  title: 'Software de Punto de Venta para Restaurantes | MRTPVREST',
  description:
    'Punto de venta para restaurantes que conecta caja, cocina (KDS), delivery, kiosko y administración en tiempo real. Prueba 14 días gratis, sin tarjeta.',
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
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'Software de Punto de Venta para Restaurantes | MRTPVREST',
    description:
      'Caja, cocina, delivery, kiosko y reportes conectados en tiempo real. El punto de venta para restaurantes LATAM.',
    url: 'https://mrtpvrest.com',
    siteName: 'MRTPVREST',
    locale: 'es_MX',
    type: 'website',
    images: [{ url: '/brand/mrtpvrest-logo.png', width: 1600, height: 900 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Software de Punto de Venta para Restaurantes | MRTPVREST',
    description: 'Punto de venta para restaurantes: caja, cocina, delivery y reportes en tiempo real.',
    images: ['/brand/mrtpvrest-logo.png'],
  },
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
