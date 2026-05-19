'use client';

import { useState } from 'react';
import { Delete } from 'lucide-react';

interface NumpadPINProps {
  onSubmit: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  maxDigits?: number;
}

/**
 * Numpad responsivo para ingreso de PIN.
 *
 * Estrategia de tamaño:
 *  - El contenedor llena el espacio disponible del padre, hasta 380px en
 *    portrait y se ensancha en landscape sin perder proporción.
 *  - Los botones usan `aspect-square` con grid 3-col para que se ajusten
 *    al ancho del contenedor — siempre cuadrados, nunca rectangulares.
 *  - La tipografía escala con `clamp(1.5rem, 5vmin, 2.5rem)`: el `vmin`
 *    asegura que crezca tanto en pantallas anchas como altas pero queda
 *    acotada para no romper layout.
 *  - El gap también es relativo (`min(2vmin, 14px)`) para que el padding
 *    visual sea consistente en cualquier orientación.
 *
 * Sin :hover por mandato diseño operativo — solo `active:scale-95` para feedback
 * táctil real en tablets.
 */
export default function NumpadPIN({
  onSubmit,
  disabled = false,
  maxDigits = 4,
}: NumpadPINProps) {
  const [pin, setPin] = useState('');

  const playSound = () => {
    if (typeof window === 'undefined') return;
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      /* algún navegador sin AudioContext habilitado — silencio */
    }
  };

  const handleDigitClick = (digit: string) => {
    if (disabled || pin.length >= maxDigits) return;
    playSound();
    const next = pin + digit;
    setPin(next);
    if (next.length === maxDigits) {
      onSubmit(next);
    }
  };

  const handleDelete = () => {
    if (disabled) return;
    setPin((p) => p.slice(0, -1));
  };

  // Estilos compartidos. Se inyectan via tailwind clases para evitar dependencia
  // de variables CSS personalizadas que pudieran no estar definidas en algún build.
  const digitClass =
    'aspect-square w-full rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 text-white font-black tabular-nums flex items-center justify-center active:scale-95 active:bg-white/10 disabled:opacity-30 disabled:active:scale-100 transition-transform select-none';
  const delClass =
    'aspect-square w-full rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 font-black flex items-center justify-center active:scale-95 active:bg-red-500/20 disabled:opacity-30 disabled:active:scale-100 transition-transform select-none';

  return (
    <div
      className="w-full max-w-[550px] mx-auto flex flex-col"
      style={{ gap: 'min(3vmin, 18px)' }}
    >
      {/* PIN DOTS — escalan con el ancho del contenedor */}
      <div
        className="flex justify-center"
        style={{ gap: 'min(4vmin, 20px)' }}
      >
        {Array.from({ length: maxDigits }).map((_, i) => {
          const filled = i < pin.length;
          return (
            <div
              key={i}
              className="rounded-full border-2 transition-all"
              style={{
                width: 'clamp(20px, 6vmin, 32px)',
                height: 'clamp(20px, 6vmin, 32px)',
                background: filled ? '#ffb84d' : 'transparent',
                borderColor: filled ? '#ffb84d' : 'rgba(255,255,255,0.2)',
                boxShadow: filled
                  ? '0 0 20px rgba(255,184,77,0.6)'
                  : 'none',
              }}
            />
          );
        })}
      </div>

      {/* GRID 3-COL · botones aspect-square */}
      <div
        className="grid grid-cols-3"
        style={{ gap: 'min(3vmin, 24px)' }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigitClick(digit)}
            disabled={disabled || pin.length >= maxDigits}
            className={digitClass}
            style={{
              fontSize: 'clamp(2.5rem, 10vmin, 5rem)',
              minHeight: 80,
            }}
          >
            {digit}
          </button>
        ))}

        {/* Empty placeholder · mantiene el grid alineado en la fila inferior */}
        <div aria-hidden />

        {/* 0 */}
        <button
          type="button"
          onClick={() => handleDigitClick('0')}
          disabled={disabled || pin.length >= maxDigits}
          className={digitClass}
          style={{
            fontSize: 'clamp(2.5rem, 10vmin, 5rem)',
            minHeight: 80,
          }}
        >
          0
        </button>

        {/* DEL */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || pin.length === 0}
          aria-label="Borrar último dígito"
          className={delClass}
          style={{ minHeight: 80 }}
        >
          <Delete style={{ width: 'clamp(24px, 6vmin, 40px)', height: 'auto' }} />
        </button>
      </div>
    </div>
  );
}
