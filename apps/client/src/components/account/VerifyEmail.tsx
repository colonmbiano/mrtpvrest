'use client';

// Destino del enlace del correo: /registro/verificar#token=…
// El token viaja en el fragmento: nunca llega al servidor de la tienda.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { readLinkToken, verifyEmail } from '@/lib/marketplaceAccount';
import { AccountShell, Notice, primaryButton, textLink } from './AccountUi';

type State = { step: 'checking' } | { step: 'done' } | { step: 'failed'; message: string };

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
      setState(result === true ? { step: 'done' } : { step: 'failed', message: result.message });
    });
  }, []);

  if (state.step === 'checking') {
    return <AccountShell title="Verificando tu correo…"><p role="status" className="text-sm text-[#617567]">Un momento.</p></AccountShell>;
  }
  if (state.step === 'done') {
    return <AccountShell title="Correo verificado">
      <CheckCircle2 className="h-10 w-10 text-[#14824a]" aria-hidden="true" />
      <p className="mt-3 text-sm leading-relaxed text-[#436e50]">Tu cuenta de cliente está lista. Entra con tu correo y contraseña.</p>
      <Link href="/cuenta/entrar" className={primaryButton + ' mt-5'}>Entrar</Link>
    </AccountShell>;
  }
  return <AccountShell title="No pudimos verificar tu correo">
    <Notice tone="error">{state.message}</Notice>
    <p className="mt-4 text-sm text-[#617567]"><Link href="/cuenta/entrar?reenviar=1" className={textLink}>Pide un enlace nuevo</Link> o vuelve a <Link href="/registro?tipo=cliente" className={textLink}>crear tu cuenta</Link>.</p>
  </AccountShell>;
}
