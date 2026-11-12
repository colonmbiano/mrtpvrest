'use client';

// Entrar a la cuenta de cliente, recuperar la contraseña o pedir otro enlace de
// verificación. Las respuestas de recuperación son genéricas: no revelan si el
// correo tiene cuenta.
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BUSINESS_LOGIN_URL, COURIER_APP_URL } from '@/lib/marketplaceAppLinks';
import { forgotPassword, login, resendVerification, safeNextPath } from '@/lib/marketplaceAccount';
import { AccountShell, captchaReady, Notice, primaryButton, TextField, textLink, Turnstile } from './AccountUi';

export type LoginMode = 'login' | 'forgot' | 'resend';

export default function BuyerLogin({ initialMode, next }: { initialMode: LoginMode; next?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [resetCaptcha, setResetCaptcha] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');

  const switchTo = (value: LoginMode) => { setMode(value); setError(''); setSent(''); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(''); setSent('');
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) { setError('Escribe un correo electrónico válido.'); return; }
    if (mode === 'login') {
      if (!password) { setError('Escribe tu contraseña.'); return; }
      setSending(true);
      const result = await login(address, password);
      setSending(false);
      if ('ok' in result) { setError(result.message); return; }
      setPassword('');
      if (result.profiles.some(p => p.role === 'COURIER') && !result.profiles.some(p => p.role === 'BUYER')) {
        window.location.assign(COURIER_APP_URL);
        return;
      }
      if (result.profiles.some(p => p.role === 'MERCHANT') && !result.profiles.some(p => p.role === 'BUYER')) {
        window.location.assign(BUSINESS_LOGIN_URL);
        return;
      }
      router.replace(safeNextPath(next));
      router.refresh();
      return;
    }
    if (!captchaReady(captcha)) { setError('Completa la verificación de seguridad.'); return; }
    setSending(true);
    const result = mode === 'forgot'
      ? await forgotPassword(address, captcha || undefined)
      : await resendVerification(address, captcha || undefined);
    setSending(false);
    setResetCaptcha(n => n + 1);
    if (result === true) {
      setSent(mode === 'forgot'
        ? 'Si el correo tiene cuenta, te enviamos un enlace para cambiar tu contraseña. Vence en 30 minutos.'
        : 'Si el correo está pendiente de verificar, te enviamos un enlace nuevo. Vence en 24 horas.');
    } else setError(result.message);
  };

  const title = mode === 'login' ? 'Entra a tu cuenta' : mode === 'forgot' ? 'Recupera tu contraseña' : 'Verifica tu correo';
  return <AccountShell title={title}
    subtitle={mode === 'login' ? <>¿Aún no tienes cuenta? <Link href="/registro?tipo=cliente" className={textLink}>Crea una</Link>.</> : undefined}>
    <form onSubmit={submit} noValidate className="space-y-5">
      <TextField id="email" label="Correo electrónico" type="email" inputMode="email" value={email}
        onChange={v => { setEmail(v); setError(''); }} autoComplete="email" placeholder="correo@ejemplo.mx" maxLength={254} />
      {mode === 'login' && <TextField id="password" label="Contraseña" type="password" value={password}
        onChange={v => { setPassword(v); setError(''); }} autoComplete="current-password" maxLength={128} />}
      {mode !== 'login' && <Turnstile onToken={setCaptcha} resetSignal={resetCaptcha} />}
      {error && <Notice tone="error">{error}</Notice>}
      {sent && <Notice tone="success">{sent}</Notice>}
      <button type="submit" disabled={sending} className={primaryButton}>
        {sending ? 'Un momento…' : mode === 'login' ? 'Entrar' : mode === 'forgot' ? 'Enviar enlace' : 'Enviar enlace nuevo'}
      </button>
    </form>
    <div className="mt-6 space-y-2 text-sm text-[#617567]">
      {mode !== 'login' && <p><button type="button" onClick={() => switchTo('login')} className={textLink}>Volver a entrar</button></p>}
      {mode !== 'forgot' && <p>¿Olvidaste tu contraseña? <button type="button" onClick={() => switchTo('forgot')} className={textLink}>Recupérala</button></p>}
      {mode !== 'resend' && <p>¿No verificaste tu correo? <button type="button" onClick={() => switchTo('resend')} className={textLink}>Pide otro enlace</button></p>}
      <p>¿Administras una tienda? <a href={BUSINESS_LOGIN_URL} className={textLink}>Entrar al panel de negocios</a></p>
    </div>
  </AccountShell>;
}
