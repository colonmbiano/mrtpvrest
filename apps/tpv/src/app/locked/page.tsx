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

  // On mount: validate device is linked, check if already in session
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

  // When PIN is entered (4 digits)
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

      // Initialize background sync
      initBackgroundSync();

      // Redirect to order type selector
      router.replace('/hub');
    } catch (err) {
      console.error('PIN validation error:', err);
      setError('Error al validar PIN');
      setIsValidating(false);
    }
  };

  const locationName = typeof window !== "undefined" ? localStorage.getItem("activeWorkspaceName") || "Caja Principal" : "Caja Principal";

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-background p-4 overflow-hidden">
      {/* Glows decorativos */}
      <div aria-hidden className="pointer-events-none absolute -top-48 -left-48 w-[700px] h-[700px] rounded-full opacity-50"
        style={{ background: "radial-gradient(circle, rgba(255,132,0,0.16) 0%, transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-48 w-[600px] h-[600px] rounded-full opacity-40"
        style={{ background: "radial-gradient(circle, rgba(136,214,108,0.14) 0%, transparent 70%)" }} />

      {/* Status pill terminal vinculada (esquina superior derecha) */}
      <div className="absolute top-6 right-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#88D66C", boxShadow: "0 0 8px #88D66C80" }} />
        <span className="text-[10px] font-bold tracking-wider" style={{ color: "#88D66C" }}>TERMINAL VINCULADA</span>
        <span className="text-[10px]" style={{ color: "#666" }}>·</span>
        <span className="text-[10px] font-semibold" style={{ color: "#FFFFFF" }}>{locationName}</span>
      </div>

      {/* Glassmorphic container — usar inline styles para no depender de
          Tailwind aliases que podrían no estar generados en el bundle */}
      <div
        className="relative z-10 w-full max-w-sm rounded-3xl p-8"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2 font-mono" style={{ color: 'var(--foreground)' }}>
            Ingresa tu PIN
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            4 dígitos para acceder
          </p>
        </div>

        {/* NumpadPIN Component */}
        <div className="mb-6">
          <NumpadPIN
            onSubmit={handlePINSubmit}
            disabled={isValidating}
          />
        </div>

        {/* Error message */}
        {error && (
          <div
            className="text-center mb-4 p-3 rounded-lg"
            style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger)' }}
          >
            <p className="text-sm font-medium" style={{ color: 'var(--danger)' }}>{error}</p>
          </div>
        )}

        {/* Loading state */}
        {isValidating && (
          <div className="text-center">
            <div className="inline-block animate-spin">
              <div
                className="h-6 w-6 border-2 rounded-full"
                style={{ borderColor: 'var(--brand)', borderTopColor: 'transparent' }}
              />
            </div>
            <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Validando...</p>
          </div>
        )}

        {/* Offline indicator */}
        <div className="mt-6 text-center">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {typeof navigator !== 'undefined' && navigator.onLine ? '🟢 Conectado' : '🔴 Offline'}
          </p>
        </div>
      </div>
    </div>
  );
}
