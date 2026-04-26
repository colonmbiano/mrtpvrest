// ════════════════════════════════════════════════════════════════════════════
// apps/landing/package.json
// ════════════════════════════════════════════════════════════════════════════
{
  "name": "@mrtpvrest/landing",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3010",
    "build": "next build",
    "start": "next start -p 3010",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "18.3.0",
    "react-dom": "18.3.0"
  },
  "devDependencies": {
    "@types/node": "20.x",
    "@types/react": "18.x",
    "@types/react-dom": "18.x",
    "typescript": "5.x"
  }
}


// ════════════════════════════════════════════════════════════════════════════
// apps/landing/next.config.js
// ════════════════════════════════════════════════════════════════════════════
/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
  },
}


// ════════════════════════════════════════════════════════════════════════════
// apps/landing/tsconfig.json
// ════════════════════════════════════════════════════════════════════════════
{
  "compilerOptions": {
    "target": "es2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}


// ════════════════════════════════════════════════════════════════════════════
// apps/landing/app/layout.tsx
// ════════════════════════════════════════════════════════════════════════════
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
  weight: ['400', '500', '600'],
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


// ════════════════════════════════════════════════════════════════════════════
// apps/landing/app/globals.css
// ════════════════════════════════════════════════════════════════════════════
:root {
  --iris-200: #dcd0ff; --iris-300: #b89eff; --iris-400: #9472ff; --iris-500: #7c3aed;
  --iris-600: #6428d0; --iris-soft: rgba(124, 58, 237, .14); --iris-glow: rgba(124, 58, 237, .35);
  --ok: #10b981; --warn: #f59e0b; --err: #ef4444; --info: #3b82f6;
  --ok-soft: rgba(16, 185, 129, .14); --warn-soft: rgba(245, 158, 11, .14);
  --err-soft: rgba(239, 68, 68, .14); --info-soft: rgba(59, 130, 246, .14);
  --bg: #08080f; --surf-1: #0f0f1c; --surf-2: #15152a; --surf-3: #1c1c38;
  --bd-1: rgba(255, 255, 255, .08); --bd-2: rgba(255, 255, 255, .14);
  --tx: #f4f4fb; --tx-hi: #ffffff; --tx-mid: #c4c4de; --tx-mut: #9494b8; --tx-dim: #6e6e92;
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--bg);
  color: var(--tx);
  font-family: var(--f-b), -apple-system, BlinkMacSystemFont, sans-serif;
  -webkit-font-smoothing: antialiased;
  font-size: 14px;
  line-height: 1.5;
}
.mono { font-family: var(--f-m), monospace; }
.display { font-family: var(--f-d), sans-serif; letter-spacing: -.02em; }

/* (... pega aquí TODOS los estilos del artifact mrtpvrest_showcase ...) */
/* desde "nav { ... }" hasta el último @media */


// ════════════════════════════════════════════════════════════════════════════
// apps/landing/app/page.tsx
// ════════════════════════════════════════════════════════════════════════════
import Image from 'next/image'

const apps = [
  { src: '/showcase/app-cliente.png', alt: 'App cliente — pedidos online desde el celular',  glow: 'green'  },
  { src: '/showcase/kiosko.png',      alt: 'Kiosko — pantalla táctil de autoservicio',       glow: 'iris'   },
  { src: '/showcase/tpv.png',         alt: 'TPV — terminal punto de venta',                  glow: 'amber'  },
  { src: '/showcase/kds.png',         alt: 'KDS — kitchen display system',                   glow: 'red'    },
  { src: '/showcase/delivery.png',    alt: 'Delivery — app móvil para repartidores',         glow: 'blue'   },
  { src: '/showcase/admin.png',       alt: 'Admin — panel de control del negocio',           glow: 'purple' },
]

export default function HomePage() {
  return (
    <>
      {/* NAV */}
      <nav>
        <div className="brand">
          <div className="brand-logo">M</div>
          <div>
            <div className="brand-name">MRTPVREST</div>
            <div className="brand-tag">POS ECOSYSTEM</div>
          </div>
        </div>
        <div className="nav-links">
          <button className="nav-link active">Plataforma</button>
          <button className="nav-link">Precios</button>
          <button className="nav-link">Docs</button>
          <button className="nav-link">Blog</button>
        </div>
        <button className="nav-cta">Empezar gratis →</button>
      </nav>

      {/* HERO */}
      <div className="hero">
        <div className="hero-badge">
          <div className="hero-badge-dot" />
          <span>ECOSISTEMA POS EN TIEMPO REAL · MRTPVREST.COM</span>
        </div>
        <h1>
          El POS que <em>conecta</em>
          <br />
          todo tu negocio
        </h1>
        <p>6 apps especializadas, una sola plataforma. Desde que el cliente ordena hasta que el dueño revisa sus reportes — todo sincronizado.</p>
        <div className="hero-actions">
          <button className="btn-primary">Registrar mi restaurante →</button>
          <button className="btn-ghost">Ver demo</button>
        </div>
      </div>

      {/* FLOW STRIP */}
      <div className="flow-strip">
        <span className="flow-pill" style={{ background: 'rgba(16,185,129,.12)', color: '#10b981' }}>APP CLIENTE</span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--iris-soft)', color: 'var(--iris-300)' }}>KIOSKO</span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>TPV</span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>KDS</span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>DELIVERY</span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--iris-soft)', color: 'var(--iris-200)' }}>ADMIN</span>
        <span style={{ marginLeft: 16, fontFamily: 'var(--f-m)', fontSize: 10, color: 'var(--tx-dim)', letterSpacing: '.08em' }}>
          FLUJO EN TIEMPO REAL
        </span>
      </div>

      {/* APPS */}
      <div className="section">
        <div className="section-hd">
          <div className="section-label">Las 6 apps</div>
          <div className="section-title">Un rol para cada pantalla</div>
          <div className="section-sub">Cada app diseñada para quien la usa, todas hablando entre sí.</div>
        </div>

        <div className="banners">
          {apps.map(app => (
            <a key={app.src} className={`banner ${app.glow}`} href="#">
              <Image
                src={app.src}
                alt={app.alt}
                width={1024}
                height={440}
                priority={app.glow === 'green'}
                sizes="(max-width: 900px) 100vw, 50vw"
              />
            </a>
          ))}
        </div>
      </div>

      {/* STATS */}
      <div className="stats-strip">
        <div className="stat"><div className="stat-num">6</div><div className="stat-lbl">APPS CONECTADAS</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--iris-400)' }}>∞</div><div className="stat-lbl">TENANTS / RESTAURANTES</div></div>
        <div className="stat"><div className="stat-num">100%</div><div className="stat-lbl">TIEMPO REAL</div></div>
        <div className="stat"><div className="stat-num" style={{ color: 'var(--ok)' }}>MX</div><div className="stat-lbl">HECHO EN LATAM</div></div>
      </div>

      {/* CTA */}
      <div className="cta-section">
        <h2>Digitaliza tu restaurante hoy</h2>
        <p>Regístrate en MRTPVREST y activa las 6 apps para tu negocio desde el primer día.</p>
        <div className="cta-actions">
          <button className="btn-primary">Registrar mi negocio →</button>
          <button className="btn-ghost">Ver demo en vivo</button>
        </div>
        <p className="cta-note">MASTER BURGER&apos;S · EL PRIMER RESTAURANTE EN LA PLATAFORMA</p>
      </div>

      {/* FOOTER */}
      <footer>
        <div className="ft-copy">© 2025 MRTPVREST · TODOS LOS DERECHOS RESERVADOS</div>
        <div className="ft-links">
          <a className="ft-link" href="#">DOCS</a>
          <a className="ft-link" href="#">PRECIOS</a>
          <a className="ft-link" href="#">CONTACTO</a>
          <a className="ft-link" href="#">PRIVACIDAD</a>
        </div>
      </footer>
    </>
  )
}
