import Image from 'next/image'

const apps = [
  { src: '/showcase/app-cliente.png', alt: 'App cliente — pedidos online desde el celular', glow: 'green' },
  { src: '/showcase/kiosko.png', alt: 'Kiosko — pantalla táctil de autoservicio', glow: 'iris' },
  { src: '/showcase/tpv.png', alt: 'TPV — terminal punto de venta', glow: 'amber' },
  { src: '/showcase/kds.png', alt: 'KDS — kitchen display system', glow: 'red' },
  { src: '/showcase/delivery.jpg', alt: 'Delivery — app móvil para repartidores', glow: 'blue' },
  { src: '/showcase/admin.jpg', alt: 'Admin — panel de control del negocio', glow: 'purple' },
] as const

export default function HomePage() {
  return (
    <>
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
        <p>
          6 apps especializadas, una sola plataforma. Desde que el cliente ordena hasta que el dueño revisa sus reportes — todo
          sincronizado.
        </p>
        <div className="hero-actions">
          <button className="btn-primary">Registrar mi restaurante →</button>
          <button className="btn-ghost">Ver demo</button>
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

      <div className="section">
        <div className="section-hd">
          <div className="section-label">Las 6 apps</div>
          <div className="section-title">Un rol para cada pantalla</div>
          <div className="section-sub">Cada app diseñada para quien la usa, todas hablando entre sí.</div>
        </div>

        <div className="banners">
          {apps.map((app, idx) => (
            <a key={app.src} className={`banner ${app.glow}`} href="#">
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

      <div className="cta-section">
        <h2>Digitaliza tu restaurante hoy</h2>
        <p>Regístrate en MRTPVREST y activa las 6 apps para tu negocio desde el primer día.</p>
        <div className="cta-actions">
          <button className="btn-primary">Registrar mi negocio →</button>
          <button className="btn-ghost">Ver demo en vivo</button>
        </div>
        <p className="cta-note">MASTER BURGER&apos;S · EL PRIMER RESTAURANTE EN LA PLATAFORMA</p>
      </div>

      <footer>
        <div className="ft-copy">© 2025 MRTPVREST · TODOS LOS DERECHOS RESERVADOS</div>
        <div className="ft-links">
          <a className="ft-link" href="#">
            DOCS
          </a>
          <a className="ft-link" href="#">
            PRECIOS
          </a>
          <a className="ft-link" href="#">
            CONTACTO
          </a>
          <a className="ft-link" href="#">
            PRIVACIDAD
          </a>
        </div>
      </footer>
    </>
  )
}
