'use client';

// Destino del enlace de recuperación: /registro/restablecer#token=…
// Cambiar la contraseña cierra todas las sesiones de la cuenta.
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { checkPassword, PASSWORD_MIN, readLinkToken, resetPassword } from '@/lib/marketplaceAccount';
import { AccountShell, Notice, primaryButton, TextField, textLink } from './AccountUi';

export default function ResetPassword() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const read = useRef(false);

  useEffect(() => {
    // Leer el fragmento una sola vez: después se borra de la barra de direcciones.
    if (read.current) return;
    read.current = true;
    setToken(readLinkToken(window.location.hash));
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const problem = checkPassword(password, confirm);
    if (problem) { setError(problem); return; }
    if (!token) return;
    setError('');
    setSending(true);
    const result = await resetPassword(token, password);
    setSending(false);
    if (result === true) { setDone(true); setPassword(''); setConfirm(''); }
    else setError(result.message);
  };

  if (token === undefined) return <AccountShell title="Cambia tu contraseña"><p role="status" className="text-sm text-[#617567]">Un momento.</p></AccountShell>;
  if (done) {
    return <AccountShell title="Contraseña actualizada">
      <CheckCircle2 className="h-10 w-10 text-[#14824a]" aria-hidden="true" />
      <p className="mt-3 text-sm leading-relaxed text-[#436e50]">Cerramos las sesiones abiertas de tu cuenta. Entra con tu contraseña nueva.</p>
      <Link href="/cuenta/entrar" className={primaryButton + ' mt-5'}>Entrar</Link>
    </AccountShell>;
  }
  if (!token) {
    return <AccountShell title="Enlace no válido">
      <Notice tone="error">El enlace no es válido. Ábrelo completo desde el correo.</Notice>
      <p className="mt-4 text-sm text-[#617567]"><Link href="/cuenta/entrar?olvide=1" className={textLink}>Pide otro enlace</Link>.</p>
    </AccountShell>;
  }
  return <AccountShell title="Cambia tu contraseña">
    <form onSubmit={submit} noValidate className="space-y-5">
      <TextField id="password" label="Contraseña nueva" type="password" value={password} onChange={v => { setPassword(v); setError(''); }}
        autoComplete="new-password" maxLength={128} hint={`Al menos ${PASSWORD_MIN} caracteres.`} />
      <TextField id="confirm" label="Confirma la contraseña" type="password" value={confirm} onChange={v => { setConfirm(v); setError(''); }}
        autoComplete="new-password" maxLength={128} />
      {error && <Notice tone="error">{error}</Notice>}
      <button type="submit" disabled={sending} className={primaryButton}>{sending ? 'Guardando…' : 'Guardar contraseña'}</button>
    </form>
  </AccountShell>;
}
