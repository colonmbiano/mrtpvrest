import Image from 'next/image'
import Link from 'next/link'
import { loginUrl, registerUrl, contactEmail } from '../_data/site'

export function SiteNav() {
  return (
    <nav className="site-nav">
      <Link className="brand" href="/" aria-label="MRTPVREST inicio">
        <Image src="/brand/mrtpvrest-logo-current.png" alt="MRTPVREST" width={2400} height={810} priority />
      </Link>
      <div className="nav-links" aria-label="Navegación principal">
        <Link href="/funciones">Funciones</Link>
        <Link href="/punto-de-venta">Giros</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/#precios">Precios</Link>
        <Link href="/comparativa/parrot">Comparativas</Link>
      </div>
      <div className="nav-actions">
        <a className="nav-login" href={loginUrl}>Entrar</a>
        <a className="nav-cta" href={registerUrl}>Registrar</a>
      </div>
    </nav>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>© 2026 MRTPVREST</span>
      <div>
        <Link href="/funciones">Funciones</Link>
        <Link href="/punto-de-venta">Giros</Link>
        <Link href="/blog">Blog</Link>
        <Link href="/comparativa/parrot">Comparativas</Link>
        <Link href="/#precios">Precios</Link>
        <a href={`mailto:${contactEmail}`}>Contacto</a>
      </div>
    </footer>
  )
}
