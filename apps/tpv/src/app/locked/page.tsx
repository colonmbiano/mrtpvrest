'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NumpadPIN from '@/components/NumpadPIN';
import { useAuthStore } from '@/store/authStore';
import { initBackgroundSync } from '@/lib/offline';

export default function LockedPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const loginWithPin = useAuthStore((state) => state.loginWithPin);

  useEffect(() => {
    const checkDevice = () => {
      const deviceLinked = document.cookie.includes('tpv-device-linked=true');
      const sessionActive = document.cookie.includes('tpv-session-active=true');

      if (!deviceLinked) {
        router.replace('/setup');
        return;
      }

      if (sessionActive) {
        router.replace('/hub');
        return;
      }
    };

    checkDevice();
  }, [router]);

  const handlePINSubmit = async (pin: string) => {
    if (pin.length !== 4) return;

    setIsValidating(true);
    setError('');

    try {
      const res = await loginWithPin(pin);

      if (!res.success) {
        setError(res.error || 'PIN incorrecto');
        setIsValidating(false);
        return;
      }

      initBackgroundSync();
      router.replace('/hub');
    } catch (err) {
      console.error('PIN validation error:', err);
      setError('Error al validar PIN');
      setIsValidating(false);
    }
  };

  const locationName = typeof window !== "undefined"
    ? localStorage.getItem("activeWorkspaceName") || "Caja Principal"
    : "Caja Principal";

  return (
    <div
      className="relative min-h-screen w-full flex items-center justify-center bg-[#0a0a0c] p-4 overflow-hidden"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      {/* Ambient Warm Tech glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-60 -left-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-60"
        style={{ background: 'radial-gradient(circle, rgba(255,184,77,0.18) 0%, transparent 70%)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-60 -right-60 w-[700px] h-[700px] rounded-full blur-[120px] opacity-50"
        style={{ background: 'radial-gradient(circle, rgba(136,214,108,0.12) 0%, transparent 70%)' }}
      />

      {/* Status pill terminal vinculada */}
      <div className="absolute top-6 right-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 backdrop-blur-md border border-white/10">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-400"
          style={{ boxShadow: '0 0 8px rgba(136,214,108,0.5)' }}
        />
        <span className="text-[10px] font-black tracking-[0.2em] text-emerald-300">TERMINAL VINCULADA</span>
        <span className="text-[10px] text-white/30">·</span>
        <span className="text-[10px] font-semibold text-white">{locationName}</span>
      </div>

      {/* Glass card central */}
      <div className="relative z-10 w-full max-w-sm rounded-3xl p-8 bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.4)]">
        <div className="text-center mb-8">
          <div className="inline-block px-4 py-1.5 mb-5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20">
            Acceso
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight mb-2">
            Ingresa tu PIN
          </h1>
          <p className="text-sm font-medium text-white/55">
            4 dígitos para acceder
          </p>
        </div>

        <div className="mb-6">
          <NumpadPIN
            onSubmit={handlePINSubmit}
            disabled={isValidating}
          />
        </div>

        {error && (
          <div
            className="text-center mb-4 p-3 rounded-2xl"
            style={{ background: 'rgba(255,92,51,0.08)', border: '1px solid rgba(255,92,51,0.25)' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#FF5C33' }}>{error}</p>
          </div>
        )}

        {isValidating && (
          <div className="text-center">
            <div className="inline-block animate-spin">
              <div
                className="h-6 w-6 border-4 rounded-full"
                style={{ borderColor: 'rgba(255,184,77,0.2)', borderTopColor: '#ffb84d' }}
              />
            </div>
            <p className="text-xs font-semibold mt-2 text-white/55">Validando...</p>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs font-medium text-white/40">
            {typeof navigator !== 'undefined' && navigator.onLine ? '🟢 Conectado' : '🔴 Offline'}
          </p>
        </div>
      </div>
    </div>
  );
}
