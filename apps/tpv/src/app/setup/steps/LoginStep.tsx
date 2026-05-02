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
          className="w-16 h-16 rounded-m flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Lock size={32} />
        </div>
        <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Configuración Inicial
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)', fontFamily: 'var(--font-secondary)' }}>
          Inicia sesión como administrador para registrar esta terminal
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <label htmlFor="email" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Correo Electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@restaurant.com"
            required
            className="w-full rounded-m text-base outline-none transition-all p-4"
            style={{
              background: 'var(--muted)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>

        <div className="flex flex-col gap-3">
          <label htmlFor="password" className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            className="w-full rounded-m text-base outline-none transition-all p-4"
            style={{
              background: 'var(--muted)',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
            }}
          />
        </div>
      </div>

      {error && (
        <div
          className="p-3 rounded-m text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-m font-bold text-base transition-all"
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
