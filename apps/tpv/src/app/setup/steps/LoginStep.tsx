'use client';

import { Lock } from 'lucide-react';
import { FormEvent, useState } from 'react';

interface LoginStepProps {
  onSubmit: (email: string, password: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function LoginStep({ onSubmit, loading, error }: LoginStepProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(email, password);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 sm:gap-8 landscape:grid landscape:grid-cols-[minmax(220px,0.9fr)_minmax(300px,1.1fr)] landscape:items-center landscape:gap-7">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Lock size={32} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold mt-4 sm:mt-6 tracking-tight" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Configuración Inicial
        </h1>
        <p className="mt-2 text-sm sm:text-base max-w-sm" style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-secondary)' }}>
          Inicia sesión como administrador para registrar esta terminal
        </p>
      </div>

      <div className="flex flex-col gap-5 sm:gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor="email" className="text-[11px] font-black uppercase tracking-[0.15em] ml-1" style={{ color: 'var(--foreground-secondary)' }}>
            Correo Electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@restaurant.com"
            required
            className="w-full rounded-xl text-base outline-none transition-all p-4 sm:p-5 font-bold"
            style={{
              background: 'var(--bg)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="password" className="text-[11px] font-black uppercase tracking-[0.15em] ml-1" style={{ color: 'var(--foreground-secondary)' }}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            className="w-full rounded-xl text-base outline-none transition-all p-4 sm:p-5 font-bold"
            style={{
              background: 'var(--bg)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="p-4 rounded-xl text-sm font-bold border landscape:col-start-2"
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 sm:py-5 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] landscape:col-start-2"
        style={{
          background: 'var(--primary)',
          color: '#000',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {loading ? 'Entrando…' : 'Continuar'}
      </button>

      {/* Registro: para tablets que descargan el TPV de la Play Store sin
        * cuenta previa. Abrimos admin.mrtpvrest.com/register en el browser
        * del sistema (Capacitor intercepta target="_system" y lanza Chrome
        * en lugar de navegar dentro del webview).
        */}
      <div className="flex flex-col items-center gap-2 -mt-2 sm:-mt-3 landscape:col-start-2">
        <span
          className="text-xs"
          style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-secondary)' }}
        >
          ¿Aún no tienes cuenta?
        </span>
        <a
          href="https://admin.mrtpvrest.com/register"
          target="_system"
          rel="noopener noreferrer"
          className="text-sm font-bold uppercase tracking-[0.15em] underline underline-offset-4"
          style={{ color: 'var(--primary)' }}
        >
          Registrar mi negocio
        </a>
      </div>
    </form>
  );
}
