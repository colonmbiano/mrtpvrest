'use client';

// Destino del enlace del correo: /registro/verificar#token=…
// El token viaja en el fragmento: nunca llega al servidor de la tienda.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { InstallAppSection } from '@/components/MarketplaceInstall';
import { BUSINESS_LOGIN_URL, COURIER_APP_URL } from '@/lib/marketplaceAppLinks';
import { readLinkToken, verifyEmail, type VerifiedRole } from '@/lib/marketplaceAccount';
import { AccountShell, Notice, primaryButton, textLink } from './AccountUi';

type State = { step: 'checking' } | { step: 'done'; roles: VerifiedRole[] } | { step: 'failed'; message: string };

export default function VerifyEmail() {
  const [state, setState] = useState<State>({ step: 'checking' });
  // El enlace es de un solo uso: el modo estricto de React corre el efecto dos
  // veces en desarrollo y la segunda llamada lo vería ya gastado.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = readLinkToken(window.location.hash);
    // Quitar el token de la barra de direcciones y del historial.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) { setState({ step: 'failed', message: 'El enlace no es válido. Ábrelo completo desde el correo.' }); return; }
    verifyEmail(token).then(result => {
      setState('roles' in result ? { step: 'done', roles: result.roles } : { step: 'failed', message: result.message });
    });
  }, []);

  if (state.step === 'checking') {
    return <AccountShell title="Verificando tu correo…"><p role="status" className="text-sm text-[#617567]">Un momento.</p></AccountShell>;
  }
  if (state.step === 'done') {
    return <AccountShell title="Correo verificado">
      <CheckCircle2 className="h-10 w-10 text-[#14824a]" aria-hidden="true" />
      {state.roles.includes('BUYER') && <>
        <p className="mt-3">Tu cuenta de cliente está lista para comprar en Mercadito Colorines.</p>
        <Link href="/cuenta/entrar" className={primaryButton + ' mt-4'}>Entrar a Mercadito</Link>
        <InstallAppSection />
      </>}
      {state.roles.includes('COURIER') && <>
        <p className="mt-3">La plataforma revisará tu solicitud. Cuando aprueben tu cuenta podrás entrar con tu correo y contraseña. Podrás recibir ofertas después de la verificación de reparto.</p>
        <a href={COURIER_APP_URL} className={primaryButton + ' mt-4'}>Abrir la app de reparto</a>
      </>}
      {state.roles.includes('MERCHANT') && <>
        <p className="mt-3">Tu solicitud de negocio pasa a revisión. Si ya tienes credenciales del panel de negocios, puedes entrar desde aquí.</p>
        <a href={BUSINESS_LOGIN_URL} className={primaryButton + ' mt-4'}>Abrir el panel de negocios</a>
      </>}
      {!state.roles.length && <Link href="/registro" className={primaryButton + ' mt-4'}>Elegir mi acceso</Link>}
    </AccountShell>;
  }
  return <AccountShell title="No pudimos verificar tu correo">
    <Notice tone="error">{state.message}</Notice>
    <p className="mt-4 text-sm text-[#617567]"><Link href="/cuenta/entrar?reenviar=1" className={textLink}>Pide un enlace nuevo</Link> o vuelve a <Link href="/registro" className={textLink}>elegir tu perfil</Link>.</p>
  </AccountShell>;
}
