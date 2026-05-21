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
  title: 'MRTPVREST | POS Warm Tech para restaurantes',
  description:
    'Controla tu restaurante en tiempo real con TPV, KDS, delivery, kiosko, app cliente y administración en una sola plataforma.',
  keywords: ['POS', 'punto de venta', 'restaurante', 'KDS', 'delivery', 'kiosko', 'TPV', 'México', 'Latam'],
  authors: [{ name: 'MRTPVREST' }],
  openGraph: {
    title: 'MRTPVREST | POS Warm Tech para restaurantes',
    description: 'Caja, cocina, delivery y reportes conectados en tiempo real para restaurantes LATAM.',
    url: 'https://mrtpvrest.com',
    siteName: 'MRTPVREST',
    locale: 'es_MX',
    type: 'website',
    images: [{ url: '/brand/mrtpvrest-logo.png', width: 1600, height: 900 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MRTPVREST | POS Warm Tech para restaurantes',
    description: 'Ecosistema POS para operar restaurantes en tiempo real.',
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
