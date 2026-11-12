'use client';

// Registro real del repartidor INDEPENDIENTE del marketplace (rol COURIER). Al
// enviarlo, el backend manda un correo de verificación; la plataforma luego aprueba
// el perfil y el repartidor inicia sesión desde la app de reparto. Espejo de
// BuyerSignup con los campos de vehículo y modalidad de red.
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { COURIER_APP_URL } from '@/lib/marketplaceAppLinks';
import { MailCheck } from 'lucide-react';
import { normalizeRegistrationDraft, validateRegistrationDraft, EMPTY_REGISTRATION_DRAFT } from '@/lib/marketplace-registration';
import { checkPassword, PASSWORD_MIN, registerCourier } from '@/lib/marketplaceAccount';
import { TermsAcceptance, AccountShell, captchaReady, Notice, primaryButton, SelectField, TextField, textLink, Turnstile } from './AccountUi';

const VEHICLE_OPTIONS = [
  { value: 'MOTO', label: '🏍️ Motocicleta' },
  { value: 'BICYCLE', label: '🚲 Bicicleta' },
  { value: 'CAR', label: '🚗 Automóvil' },
  { value: 'WALK', label: '🚶 A pie' },
];
const NETWORK_OPTIONS = [
  { value: 'SHARED', label: 'Red compartida — recibo pedidos de varias tiendas' },
  { value: 'OWN', label: 'Solo las tiendas a las que me afilie' },
  { value: 'BOTH', label: 'Ambas' },
];

export default function CourierSignup() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', city: '', password: '', confirm: '',
    vehicle: 'MOTO', network: 'SHARED',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [captcha, setCaptcha] = useState('');
  const [resetCaptcha, setResetCaptcha] = useState(0);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [sending, setSending] = useState(false);
  const [serverError, setServerError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const update = (key: keyof typeof form, value: string) => {
    setForm(old => ({ ...old, [key]: value }));
    setErrors(old => { const next = { ...old }; delete next[key]; return next; });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setServerError('');
    const draft = { ...EMPTY_REGISTRATION_DRAFT, name: form.name, email: form.email, phone: form.phone,
      city: form.city, vehicle: form.vehicle, network: form.network };
    const problems = validateRegistrationDraft('repartidor', draft);
    const passwordProblem = checkPassword(form.password, form.confirm);
    if (passwordProblem) problems[form.password.length < PASSWORD_MIN || form.password.length > 128 ? 'password' : 'confirm'] = passwordProblem;
    setErrors(problems);
    if (Object.keys(problems).length) return;
    if (!termsAccepted) { setServerError('Acepta el aviso de privacidad y los términos.'); return; }
    if (!captchaReady(captcha)) { setServerError('Completa la verificación de seguridad.'); return; }
    const clean = normalizeRegistrationDraft(draft);
    setSending(true);
    const result = await registerCourier({ fullName: clean.name, email: clean.email, phone: clean.phone, city: clean.city,
      password: form.password, termsAccepted, vehicle: form.vehicle, network: form.network, turnstileToken: captcha || undefined });
    setSending(false);
    setResetCaptcha(n => n + 1);
    if (result === true) { setSentTo(clean.email); setForm(old => ({ ...old, password: '', confirm: '' })); }
    else setServerError(result.message);
  };

  if (sentTo) {
    return <AccountShell title="Revisa tu correo">
      <MailCheck className="h-10 w-10 text-[#14824a]" aria-hidden="true" />
      <p className="mt-3 text-sm leading-relaxed text-[#436e50]">
        Si <strong className="break-all">{sentTo}</strong> puede registrarse, te enviamos un enlace para verificarlo.
        Después de verificar tu correo, la plataforma revisa tu solicitud de repartidor y, al aprobarla,
        podrás iniciar sesión desde la app de reparto.
      </p>
      <a href={COURIER_APP_URL} className={primaryButton + ' mt-4'}>Abrir la app de reparto</a>
      <p className="mt-4 text-sm text-[#617567]">¿No te llegó? Revisa tu carpeta de spam o <Link href="/cuenta/entrar?reenviar=1" className={textLink}>pide otro enlace</Link>.</p>
    </AccountShell>;
  }

  return <AccountShell title="Regístrate como repartidor"
    subtitle={<>Reparte para las tiendas de la red del marketplace. ¿Ya tienes cuenta? <a href={COURIER_APP_URL} className={textLink}>Entrar a reparto</a>.</>}>
    <form onSubmit={submit} noValidate className="space-y-5">
      <TextField id="name" label="Nombre completo" value={form.name} onChange={v => update('name', v)} error={errors.name}
        autoComplete="name" placeholder="Tu nombre y apellidos" maxLength={100} />
      <TextField id="email" label="Correo electrónico" type="email" inputMode="email" value={form.email} onChange={v => update('email', v)}
        error={errors.email} autoComplete="email" placeholder="correo@ejemplo.mx" maxLength={254} />
      <TextField id="phone" label="Teléfono" type="tel" inputMode="tel" value={form.phone} onChange={v => update('phone', v)}
        error={errors.phone} autoComplete="tel" placeholder="722 123 4567" maxLength={20} hint="10 dígitos de México." />
      <TextField id="city" label="Ciudad o localidad" value={form.city} onChange={v => update('city', v)} error={errors.city}
        autoComplete="address-level2" placeholder="Ej. Valle de Bravo" maxLength={100} />
      <SelectField id="vehicle" label="¿Con qué repartes?" value={form.vehicle} onChange={v => update('vehicle', v)}
        error={errors.vehicle} options={VEHICLE_OPTIONS} />
      <SelectField id="network" label="Modalidad de reparto" value={form.network} onChange={v => update('network', v)}
        error={errors.network} options={NETWORK_OPTIONS} />
      <TextField id="password" label="Contraseña" type="password" value={form.password} onChange={v => update('password', v)}
        error={errors.password} autoComplete="new-password" maxLength={128} hint={`Al menos ${PASSWORD_MIN} caracteres. Una frase es fácil de recordar.`} />
      <TextField id="confirm" label="Confirma tu contraseña" type="password" value={form.confirm} onChange={v => update('confirm', v)}
        error={errors.confirm} autoComplete="new-password" maxLength={128} />
      <TermsAcceptance checked={termsAccepted} onChange={setTermsAccepted} />
      <Turnstile onToken={setCaptcha} resetSignal={resetCaptcha} />
      {serverError && <Notice tone="error">{serverError}</Notice>}
      <button type="submit" disabled={sending || !termsAccepted} className={primaryButton}>{sending ? 'Creando tu cuenta…' : 'Crear cuenta de repartidor'}</button>
      {Object.keys(errors).length > 0 && <p className="text-sm font-semibold text-red-700" role="status">Corrige los campos marcados para continuar.</p>}
    </form>
  </AccountShell>;
}
