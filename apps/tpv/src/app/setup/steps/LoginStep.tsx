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
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Lock size={32} />
        </div>
        <h1 className="text-3xl font-bold mt-6 tracking-tight" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Configuración Inicial
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-secondary)' }}>
          Inicia sesión como administrador para registrar esta terminal
        </p>
      </div>

      <div className="flex flex-col gap-6">
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
            className="w-full rounded-xl text-base outline-none transition-all p-5 font-bold"
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
            className="w-full rounded-xl text-base outline-none transition-all p-5 font-bold"
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
          className="p-4 rounded-xl text-sm font-bold border"
          style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.2)' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-5 rounded-xl font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98]"
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
    </form>
  );
}
