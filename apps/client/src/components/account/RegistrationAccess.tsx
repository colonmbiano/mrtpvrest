'use client';

import Link from 'next/link';
import { BUSINESS_LOGIN_URL, BUSINESS_SIGNUP_URL } from '@/lib/marketplaceAppLinks';
import { AccountShell, primaryButton, secondaryButton } from './AccountUi';

export function BusinessAccess() {
  return <AccountShell title="Registra tu negocio" subtitle="Crea tu cuenta de propietario en el panel de negocios.">
    <p className="text-sm">Después de verificar tu correo y configurar tu negocio, activa el módulo Marketplace en el panel y pulsa «Solicitar aparecer» para pedir la publicación en Mercadito Colorines.</p>
    <a href={BUSINESS_SIGNUP_URL} className={primaryButton + ' mt-4'}>Registrar mi negocio</a>
    <a href={BUSINESS_LOGIN_URL} className={secondaryButton + ' mt-3'}>Ya tengo un negocio · Entrar al panel</a>
  </AccountShell>;
}

export function RegistrationAccess({ accountsEnabled }: { accountsEnabled: boolean }) {
  return <AccountShell title="¿Cómo quieres usar Mercadito Colorines?">
    <nav aria-label="Perfiles de Mercadito" className="grid gap-3">
      {accountsEnabled ? <>
        <Link className={secondaryButton} href="/registro?tipo=cliente">Comprar como cliente</Link>
        <Link className={secondaryButton} href="/registro?tipo=repartidor">Trabajar como repartidor</Link>
      </> : <p>El registro de clientes y repartidores no está disponible en este momento.</p>}
      <Link className={secondaryButton} href="/registro?tipo=negocio">Registrar o administrar mi negocio</Link>
    </nav>
  </AccountShell>;
}
