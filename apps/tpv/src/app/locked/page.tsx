'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import NumpadPIN from '@/components/NumpadPIN';
import { useAuthStore } from '@/store/authStore';
import { initBackgroundSync } from '@/lib/offline';
import api from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  POS: 'Caja',
  WAITER: 'Comandera',
  KDS: 'Cocina',
};

export default function LockedPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [terminalName, setTerminalName] = useState<string>('Terminal');
  const [terminalKind, setTerminalKind] = useState<string>('CAJA');
  const [locationName, setLocationName] = useState<string>('Sucursal');
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

  // FASE 7 · IDENTIDAD DE TERMINAL
  // Carga el nombre del dispositivo en este orden:
  //  1. localStorage.deviceName (cacheado al bind o tras refresh)
  //  2. POST /api/devices/identity (refresh autoritativo si tenemos token)
  //  3. Fallback derivado de deviceRole (Comandera / Caja / Cocina)
  // Si admin renombra el device, próximo unlock toma el nombre nuevo.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const cached = localStorage.getItem('deviceName');
    const deviceRole = localStorage.getItem('deviceRole') || 'POS';
    const fallback = ROLE_LABEL[deviceRole] || 'Terminal';

    setTerminalKind(deviceRole === 'WAITER' ? 'COMANDERA' : 'CAJA');
    setTerminalName(cached || fallback);
    setLocationName(
      localStorage.getItem('locationName') ||
        localStorage.getItem('activeWorkspaceName') ||
        'Sucursal'
    );

    const token = localStorage.getItem('deviceToken');
    if (!token) return;

    // Refresh sin bloquear UI — si la red falla, nos quedamos con el cache.
    api
      .post('/api/devices/identity', { deviceToken: token })
      .then(({ data }) => {
        if (data?.name) {
          localStorage.setItem('deviceName', data.name);
          setTerminalName(data.name);
        }
        if (data?.type) {
          setTerminalKind(data.type === 'WAITER' ? 'COMANDERA' : data.type);
        }
      })
      .catch(() => {
        /* sin red — mantener cache */
      });
  }, []);

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

  return (
    <div
      className="relative min-h-[100dvh] w-full flex items-center justify-center bg-[#0C0C0E] p-4 overflow-hidden"
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

      {/* TERMINAL IDENTITY PILL — fase 7 */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/5 backdrop-blur-md border border-white/10 max-w-[80vw]">
        <span
          className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
          style={{ boxShadow: '0 0 8px rgba(136,214,108,0.5)' }}
        />
        <span className="text-[10px] font-black tracking-[0.2em] text-emerald-300 shrink-0">
          {terminalKind}
        </span>
        <span className="text-[10px] text-white/30 shrink-0">·</span>
        <span className="text-[11px] font-black text-white truncate">
          {terminalName}
        </span>
      </div>

      {/* Glass card central — el contenido se reorganiza en landscape via
          el flex-row breakpoint @lg para no encajonar al usuario en
          tablets de orientación variable. */}
      <div className="relative z-10 w-full max-w-[420px] lg:max-w-[860px] rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 shadow-[0_30px_80px_rgba(0,0,0,0.4)] flex flex-col lg:flex-row overflow-hidden">
        {/* PROMPT */}
        <div className="flex-1 p-7 sm:p-9 flex flex-col justify-center text-center lg:text-left lg:border-r lg:border-white/10">
          <div className="inline-block self-center lg:self-start px-4 py-1.5 mb-4 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[#ffb84d] bg-[#ffb84d]/10 border border-[#ffb84d]/20">
            Acceso · {locationName}
          </div>
          <h1 className="text-[clamp(1.75rem,4vw,2.5rem)] font-black text-white tracking-tight leading-tight">
            {terminalName}
          </h1>
          <p className="text-sm font-medium text-white/55 mt-2">
            Ingresa tu PIN de 4 dígitos para iniciar turno
          </p>

          <p className="text-xs font-bold text-white/40 mt-6">
            {typeof navigator !== 'undefined' && navigator.onLine
              ? '🟢 Conectado'
              : '🔴 Offline'}
          </p>
        </div>

        {/* NUMPAD */}
        <div className="flex-1 p-5 sm:p-7 flex flex-col justify-center">
          <NumpadPIN onSubmit={handlePINSubmit} disabled={isValidating} />

          {error && (
            <div
              className="text-center mt-4 p-3 rounded-2xl"
              style={{
                background: 'rgba(255,92,51,0.08)',
                border: '1px solid rgba(255,92,51,0.25)',
              }}
            >
              <p className="text-sm font-semibold" style={{ color: '#FF5C33' }}>
                {error}
              </p>
            </div>
          )}

          {isValidating && (
            <div className="text-center mt-4">
              <div className="inline-block animate-spin">
                <div
                  className="h-6 w-6 border-4 rounded-full"
                  style={{
                    borderColor: 'rgba(255,184,77,0.2)',
                    borderTopColor: '#ffb84d',
                  }}
                />
              </div>
              <p className="text-xs font-semibold mt-2 text-white/55">
                Validando...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
