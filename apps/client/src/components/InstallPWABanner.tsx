'use client';

import { useEffect, useState } from 'react';
import { Download, X, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';

const DISMISSED_KEY = 'pwa-install-dismissed-until';
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 1 semana

interface InstallPWABannerProps {
  /** Texto principal del banner. Si se omite usa "Instala nuestra app". */
  title?: string;
  /** Subtítulo opcional. */
  description?: string;
  /** Color de acento del botón (hex) — por defecto naranja brand. */
  accentColor?: string;
}

/**
 * Banner flotante "Add To Home Screen" con estilo glassmorphism.
 *
 * Solo se renderiza cuando:
 * - El navegador soporta el evento `beforeinstallprompt`
 * - La app aún no está instalada
 * - El usuario no descartó el banner en los últimos 7 días
 *
 * Si el usuario instala o descarta, persiste el estado en localStorage
 * para no ser intrusivo.
 */
export default function InstallPWABanner({
  title = 'Instala nuestra app',
  description = 'Tu menú a un toque, sin abrir el navegador.',
  accentColor = '#FF8400',
}: InstallPWABannerProps) {
  const { canInstall, promptInstall } = useInstallPrompt();
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const until = Number(localStorage.getItem(DISMISSED_KEY) || 0);
    setHidden(Date.now() < until);
  }, []);

  if (!canInstall || hidden) return null;

  const dismiss = (persist = true) => {
    if (persist && typeof window !== 'undefined') {
      localStorage.setItem(DISMISSED_KEY, String(Date.now() + DISMISS_TTL_MS));
    }
    setHidden(true);
  };

  const handleInstall = async () => {
    setBusy(true);
    try {
      const accepted = await promptInstall();
      // En ambos casos (aceptar o rechazar) cerramos el banner — no spamear
      dismiss(accepted ? false : true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Instalar aplicación"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto max-w-md
                 bg-white/10 border border-white/20 backdrop-blur-md
                 rounded-xl shadow-2xl text-white
                 animate-in slide-in-from-bottom-5 fade-in duration-300"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: accentColor, color: '#0C0C0E' }}
          aria-hidden
        >
          <Smartphone size={18} strokeWidth={2.5} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold truncate">{title}</p>
          <p className="text-xs text-white/70 truncate">{description}</p>
        </div>

        <button
          onClick={handleInstall}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full
                     px-3.5 py-2 text-xs font-bold transition
                     hover:scale-[1.03] active:scale-95 disabled:opacity-50"
          style={{ background: accentColor, color: '#0C0C0E' }}
        >
          <Download size={13} />
          {busy ? 'Abriendo…' : 'Instalar'}
        </button>

        <button
          onClick={() => dismiss(true)}
          aria-label="Cerrar"
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                     text-white/60 hover:text-white hover:bg-white/10 transition"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
