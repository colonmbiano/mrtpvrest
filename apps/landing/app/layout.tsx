import type { Metadata } from 'next'
import { Syne, DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'

const syne = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--f-d',
  display: 'swap',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--f-b',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--f-m',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://mrtpvrest.com'),
  title: 'MRTPVREST — Ecosistema POS para restaurantes',
  description:
    'El POS que conecta todo tu negocio. 6 apps especializadas, una sola plataforma. Desde que el cliente ordena hasta que el dueño revisa sus reportes.',
  keywords: ['POS', 'punto de venta', 'restaurante', 'kiosko', 'KDS', 'delivery', 'México', 'SaaS'],
  authors: [{ name: 'MRTPVREST' }],
  openGraph: {
    title: 'MRTPVREST — Ecosistema POS para restaurantes',
    description: '6 apps conectadas en tiempo real para tu restaurante.',
    url: 'https://mrtpvrest.com',
    siteName: 'MRTPVREST',
    locale: 'es_MX',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MRTPVREST — Ecosistema POS para restaurantes',
    description: '6 apps conectadas en tiempo real.',
    images: ['/og-image.png'],
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${syne.variable} ${dmSans.variable} ${dmMono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
