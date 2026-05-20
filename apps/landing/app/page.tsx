import Image from 'next/image'
import Link from 'next/link'

const adminUrl = 'https://admin.mrtpvrest.com'
const apkUrl = `${adminUrl}/apks/tpv-debug.apk`

const apps = [
  { src: '/showcase/app-cliente.png', alt: 'App cliente - pedidos online desde el celular', glow: 'green', href: '#apps' },
  { src: '/showcase/kiosko.png', alt: 'Kiosko - pantalla táctil de autoservicio', glow: 'iris', href: '#apps' },
  { src: '/showcase/tpv.png', alt: 'TPV - terminal punto de venta', glow: 'amber', href: apkUrl },
  { src: '/showcase/kds.png', alt: 'KDS - kitchen display system', glow: 'red', href: '#apps' },
  { src: '/showcase/delivery.jpg', alt: 'Delivery - app móvil para repartidores', glow: 'blue', href: '#apps' },
  { src: '/showcase/admin.jpg', alt: 'Admin - panel de control del negocio', glow: 'purple', href: `${adminUrl}/login` },
] as const

export default function HomePage() {
  return (
    <>
      <nav id="plataforma">
        <div className="brand">
          <div className="brand-logo">M</div>
          <div>
            <div className="brand-name">MRTPVREST</div>
            <div className="brand-tag">POS ECOSYSTEM</div>
          </div>
        </div>
        <div className="nav-links">
          <a className="nav-link active" href="#plataforma">Plataforma</a>
          <a className="nav-link" href="#apps">Apps</a>
          <a className="nav-link" href="#descargar">Descargar APK</a>
          <a className="nav-link" href="#contacto">Contacto</a>
        </div>
        <div className="nav-actions">
          <a href={`${adminUrl}/login`} className="btn-login">Iniciar sesión</a>
          <a href={apkUrl} className="btn-nav-download" download>APK</a>
          <a href={`${adminUrl}/register`} className="nav-cta">Empezar gratis</a>
        </div>
      </nav>

      <div className="hero">
        <div className="hero-badge animate-in">
          <div className="hero-badge-dot" />
          <span>ECOSISTEMA POS EN TIEMPO REAL · MRTPVREST.COM</span>
        </div>
        <h1 className="animate-in delay-1">
          El POS que <em>conecta</em>
          <br />
          todo tu negocio
        </h1>
        <p className="animate-in delay-2">
          6 apps especializadas, una sola plataforma. Desde que el cliente ordena hasta que el dueño revisa sus reportes,
          todo sincronizado.
        </p>
        <div className="hero-actions animate-in delay-3">
          <a href={`${adminUrl}/register`} className="btn-primary">Registrar mi restaurante</a>
          <a href={apkUrl} className="btn-download" download>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Descargar TPV (APK)
          </a>
          <Link href="/demo" className="btn-ghost">
            Ver demo
          </Link>
        </div>
      </div>

      <div className="flow-strip">
        <span className="flow-pill" style={{ background: 'rgba(16,185,129,.12)', color: '#10b981' }}>
          APP CLIENTE
        </span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--iris-soft)', color: 'var(--iris-300)' }}>
          KIOSKO
        </span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}>
          TPV
        </span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}>
          KDS
        </span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
          DELIVERY
        </span>
        <span className="flow-arrow">→</span>
        <span className="flow-pill" style={{ background: 'var(--iris-soft)', color: 'var(--iris-200)' }}>
          ADMIN
        </span>
        <span
          style={{
            marginLeft: 16,
            fontFamily: 'var(--f-m)',
            fontSize: 10,
            color: 'var(--tx-dim)',
            letterSpacing: '.08em',
          }}
        >
          FLUJO EN TIEMPO REAL
        </span>
      </div>

      <div id="apps" className="section">
        <div className="section-hd">
          <div className="section-label">Las 6 apps</div>
          <div className="section-title">Un rol para cada pantalla</div>
          <div className="section-sub">Cada app diseñada para quien la usa, todas hablando entre sí.</div>
        </div>

        <div className="banners">
          {apps.map((app, idx) => (
            <a key={app.src} className={`banner ${app.glow}`} href={app.href}>
              <Image
                src={app.src}
                alt={app.alt}
                width={1024}
                height={440}
                priority={idx === 0}
                sizes="(max-width: 900px) 100vw, 50vw"
              />
            </a>
          ))}
        </div>
      </div>

      <div className="stats-strip">
        <div className="stat">
          <div className="stat-num">6</div>
          <div className="stat-lbl">APPS CONECTADAS</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: 'var(--iris-400)' }}>
            ∞
          </div>
          <div className="stat-lbl">TENANTS / RESTAURANTES</div>
        </div>
        <div className="stat">
          <div className="stat-num">100%</div>
          <div className="stat-lbl">TIEMPO REAL</div>
        </div>
        <div className="stat">
          <div className="stat-num" style={{ color: 'var(--ok)' }}>
            MX
          </div>
          <div className="stat-lbl">HECHO EN LATAM</div>
        </div>
      </div>

      <div id="descargar" className="cta-section">
        <h2>Digitaliza tu restaurante hoy</h2>
        <p>Regístrate en MRTPVREST y activa las 6 apps para tu negocio desde el primer día.</p>
        <div className="cta-actions animate-in delay-1">
          <a href={`${adminUrl}/register`} className="btn-primary">Registrar mi negocio</a>
          <a href={apkUrl} className="btn-download" download>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Descargar TPV (APK)
          </a>
        </div>
        <p className="cta-note">RESTAURANTE DEMO · EL PRIMER RESTAURANTE EN LA PLATAFORMA</p>
      </div>

      <footer id="contacto">
        <div className="ft-copy">© 2026 MRTPVREST · TODOS LOS DERECHOS RESERVADOS</div>
        <div className="ft-links">
          <a className="ft-link" href="#apps">
            APPS
          </a>
          <a className="ft-link" href={`${adminUrl}/register`}>
            REGISTRO
          </a>
          <a className="ft-link" href="mailto:contacto@mrtpvrest.com">
            CONTACTO
          </a>
          <a className="ft-link" href={apkUrl} download>
            APK
          </a>
        </div>
      </footer>
    </>
  )
}
