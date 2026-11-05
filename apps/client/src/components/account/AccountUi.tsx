'use client';

// Piezas comunes de las pantallas de la cuenta del comprador (mismo estilo que
// el registro del marketplace).
import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export const outline = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d8451]';
const control = 'mt-1.5 block min-h-12 w-full rounded-xl border border-[#dce5df] bg-white px-3.5 py-3 text-base text-[#23362b] shadow-sm outline-none focus:border-[#159055] focus:ring-2 focus:ring-[#d9f4e3]';
export const primaryButton = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#f15a24] px-5 py-3 font-extrabold text-white hover:bg-[#d34d1d] disabled:cursor-not-allowed disabled:opacity-60 ' + outline;
export const secondaryButton = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-[#b0d7bf] bg-white px-4 py-2.5 text-sm font-bold text-[#176c42] hover:bg-[#f0faf2] disabled:opacity-60 ' + outline;
export const textLink = 'font-bold text-[#176c42] underline-offset-2 hover:underline ' + outline;

export function AccountShell({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return <div className="min-h-[100dvh] bg-[#f8faf8] pb-12 text-[#1c3028]">
    <header className="border-b border-[#e1ebe3] bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/" className={'flex items-center gap-2 rounded-lg font-black tracking-tight text-[#187445] ' + outline}>
          <span className="grid size-10 place-items-center rounded-xl bg-[#e6f4e8] text-xl" aria-hidden="true">🛍️</span>
          <span>MRTPVREST <span className="text-[#f45b27]">Marketplace</span></span>
        </Link>
        <Link href="/" className={'flex items-center gap-1 text-sm font-semibold text-[#546b5c] hover:text-[#e65b27] ' + outline}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver a tiendas
        </Link>
      </div>
    </header>
    <main className="mx-auto max-w-md px-4 pt-8 sm:pt-12">
      <h1 className="text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
      {subtitle && <div className="mt-2 text-sm leading-relaxed text-[#617567]">{subtitle}</div>}
      <div className="mt-6 rounded-3xl border border-[#e0e9e1] bg-white p-5 shadow-[0_15px_45px_rgba(22,65,35,.05)] sm:p-7">{children}</div>
    </main>
  </div>;
}

export function TextField({ id, label, value, onChange, error, type = 'text', placeholder, autoComplete, maxLength = 120, inputMode, hint }: {
  id: string; label: string; value: string; onChange: (value: string) => void; error?: string; type?: string;
  placeholder?: string; autoComplete?: string; maxLength?: number; inputMode?: 'tel' | 'email' | 'text'; hint?: string;
}) {
  const described = [error ? id + '-error' : '', hint ? id + '-hint' : ''].filter(Boolean).join(' ') || undefined;
  return <div>
    <label htmlFor={id} className="block text-sm font-bold text-[#304438]">{label}</label>
    <input id={id} name={id} value={value} onChange={event => onChange(event.target.value)} type={type}
      autoComplete={autoComplete} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} required
      aria-invalid={Boolean(error)} aria-describedby={described}
      className={control + (error ? ' !border-red-500' : '')} />
    {hint && !error && <p id={id + '-hint'} className="mt-1 text-xs text-[#697b6d]">{hint}</p>}
    {error && <p id={id + '-error'} role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}

export function SelectField({ id, label, value, onChange, options, error, hint }: {
  id: string; label: string; value: string; onChange: (value: string) => void;
  options: { value: string; label: string }[]; error?: string; hint?: string;
}) {
  const described = [error ? id + '-error' : '', hint ? id + '-hint' : ''].filter(Boolean).join(' ') || undefined;
  return <div>
    <label htmlFor={id} className="block text-sm font-bold text-[#304438]">{label}</label>
    <select id={id} name={id} value={value} onChange={event => onChange(event.target.value)}
      aria-invalid={Boolean(error)} aria-describedby={described}
      className={control + ' appearance-none bg-[right_0.9rem_center] bg-no-repeat pr-10' + (error ? ' !border-red-500' : '')}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23546b5c' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E\")" }}>
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
    {hint && !error && <p id={id + '-hint'} className="mt-1 text-xs text-[#697b6d]">{hint}</p>}
    {error && <p id={id + '-error'} role="alert" className="mt-1 text-xs font-semibold text-red-700">{error}</p>}
  </div>;
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = tone === 'error' ? 'border-red-200 bg-red-50 text-red-800'
    : tone === 'success' ? 'border-[#b7dfc4] bg-[#f0faf2] text-[#255d3a]' : 'border-[#f3d79d] bg-[#fff8e9] text-[#795322]';
  return <div role={tone === 'error' ? 'alert' : 'status'} className={'rounded-2xl border p-4 text-sm leading-relaxed ' + styles}>{children}</div>;
}

// Captcha del registro y de los correos (Cloudflare Turnstile). Sin clave pública no
// se pinta y el formulario manda la solicitud sin token: el backend en producción la
// rechaza con CAPTCHA_REQUIRED y la pantalla lo explica.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';

type TurnstileApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id?: string) => void };

export function Turnstile({ onToken, resetSignal }: { onToken: (token: string) => void; resetSignal: number }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const callback = useRef(onToken);
  callback.current = onToken;

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !box.current) return;
    let stopped = false;
    const api = () => (window as unknown as { turnstile?: TurnstileApi }).turnstile;
    const mount = () => {
      if (stopped || !box.current || widget.current || !api()) return;
      widget.current = api()!.render(box.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => callback.current(token),
        'expired-callback': () => callback.current(''),
        'error-callback': () => callback.current(''),
      });
    };
    if (api()) mount();
    else {
      let script = document.getElementById('cf-turnstile-script') as HTMLScriptElement | null;
      if (!script) {
        script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener('load', mount);
    }
    return () => {
      stopped = true;
      if (widget.current) api()?.remove(widget.current);
      widget.current = null;
    };
  }, []);

  // Un token de Turnstile sirve una sola vez: tras cada envío se pide otro.
  useEffect(() => {
    if (resetSignal && widget.current) {
      (window as unknown as { turnstile?: TurnstileApi }).turnstile?.reset(widget.current);
      callback.current('');
    }
  }, [resetSignal]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={box} className="min-h-[65px]" />;
}

export function captchaReady(token: string): boolean {
  return !TURNSTILE_SITE_KEY || token.length > 0;
}
