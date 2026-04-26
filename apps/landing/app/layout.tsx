import type { Metadata } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://mrtpvrest.com'),
  title: 'MRTPVREST — El sistema de gestión todo-en-uno para tu restaurante',
  description:
    'TPV, pedidos online, delivery, KDS y reportes en tiempo real. Una sola plataforma para gestionar todo tu restaurante.',
  keywords: [
    'POS restaurante',
    'TPV',
    'sistema de gestión restaurante',
    'KDS',
    'pedidos online',
    'delivery',
    'multi-sucursal',
    'SaaS restaurante',
  ],
  openGraph: {
    title: 'MRTPVREST — Gestión todo-en-uno para tu restaurante',
    description:
      'TPV, pedidos online, delivery, KDS y reportes en tiempo real. Una sola plataforma.',
    url: 'https://mrtpvrest.com',
    siteName: 'MRTPVREST',
    locale: 'es_MX',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MRTPVREST — Gestión todo-en-uno para tu restaurante',
    description: 'TPV, pedidos online, delivery, KDS y reportes en tiempo real.',
  },
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
