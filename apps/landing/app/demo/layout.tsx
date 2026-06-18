import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo · MRTPVREST',
  description: 'Mira el flujo de un pedido a través de las 6 apps.',
  robots: { index: false, follow: false },
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ overflow: 'hidden' }}>{children}</div>
}
