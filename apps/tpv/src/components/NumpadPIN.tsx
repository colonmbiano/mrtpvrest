"use client";

import { useEffect, useRef, useState } from "react";
import { Delete } from "lucide-react";

interface NumpadPINProps {
  onSubmit: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  maxDigits?: number;
  submitLabel?: string;
  onChange?: (pin: string) => void;
  /** Envía automáticamente al capturar el último dígito (sin botón Ingresar). */
  autoSubmit?: boolean;
}

export default function NumpadPIN({
  onSubmit,
  disabled = false,
  maxDigits = 4,
  submitLabel = "Ingresar",
  onChange,
  autoSubmit = false,
}: NumpadPINProps) {
  const [pin, setPin] = useState("");
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const updatePin = (next: string) => {
    setPin(next);
    onChangeRef.current?.(next);
  };

  const playSound = () => {
    if (typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 820;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.16, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.08);
    } catch {
      /* AudioContext can be unavailable on locked-down terminals. */
    }
  };

  const handleDigitClick = (digit: string) => {
    if (disabled || pin.length >= maxDigits) return;
    playSound();
    updatePin(pin + digit);
  };

  const handleDelete = () => {
    if (disabled || pin.length === 0) return;
    updatePin(pin.slice(0, -1));
  };

  const handleClear = () => {
    if (disabled || pin.length === 0) return;
    updatePin("");
  };

  const handleSubmit = async () => {
    if (disabled || pin.length !== maxDigits) return;
    try {
      await onSubmit(pin);
    } finally {
      updatePin("");
    }
  };

  // Auto-envío: al capturar el último dígito se envía solo, sin pulsar Ingresar.
  useEffect(() => {
    if (!autoSubmit || disabled || pin.length !== maxDigits) return;
    void handleSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, autoSubmit, disabled, maxDigits]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;

      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handleDigitClick(event.key);
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleDelete();
      } else if (event.key === "Escape") {
        event.preventDefault();
        handleClear();
      } else if (event.key === "Enter") {
        event.preventDefault();
        void handleSubmit();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const digitClass =
    "aspect-square w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] font-display font-semibold tabular-nums flex items-center justify-center active:scale-[0.98] active:bg-[var(--surface-2)] disabled:opacity-35 disabled:active:scale-100 transition-colors select-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
  const utilityClass =
    "aspect-square w-full rounded-2xl text-[var(--text-secondary)] font-black flex items-center justify-center active:scale-[0.98] active:bg-[var(--surface-2)] disabled:opacity-35 disabled:active:scale-100 transition-colors select-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]";
  const canSubmit = pin.length === maxDigits && !disabled;

  return (
    <div
      className="mx-auto flex w-full max-w-[min(80vw,36dvh,400px)] flex-col sm:max-w-[min(72vw,36dvh,400px)] landscape:max-w-[min(36vw,36dvh,400px)]"
      style={{ gap: "clamp(5px, 1.4vmin, 14px)" }}
    >
      <div
        className="flex justify-center"
        style={{ gap: "clamp(8px, 2vmin, 14px)" }}
        aria-label={`${pin.length} de ${maxDigits} dígitos capturados`}
      >
        {Array.from({ length: maxDigits }).map((_, index) => {
          const filled = index < pin.length;
          return (
            <div
              key={index}
              className="rounded-full border-2 transition-colors"
              style={{
                width: "clamp(11px, 2.8vmin, 16px)",
                height: "clamp(11px, 2.8vmin, 16px)",
                background: filled ? "var(--brand)" : "var(--surface-1)",
                borderColor: filled ? "var(--brand)" : "var(--border-strong)",
                boxShadow: filled ? "0 0 16px var(--brand-glow)" : "none",
              }}
            />
          );
        })}
      </div>

      <div
        className="grid grid-cols-3"
        style={{ gap: "clamp(5px, 1.5vmin, 14px)" }}
      >
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleDigitClick(digit)}
            disabled={disabled || pin.length >= maxDigits}
            className={digitClass}
            style={{
              fontSize: "clamp(1.6rem, min(6vmin, 4.6dvh), 3.4rem)",
              minHeight: "clamp(44px, min(11vmin, 8.5dvh), 80px)",
            }}
          >
            {digit}
          </button>
        ))}

        {/* Celda vacía (sin "Limpiar", según el rediseño). Escape sigue limpiando. */}
        <div aria-hidden />

        <button
          type="button"
          onClick={() => handleDigitClick("0")}
          disabled={disabled || pin.length >= maxDigits}
          className={digitClass}
          style={{
            fontSize: "clamp(1.35rem, min(5.2vmin, 4dvh), 3rem)",
            minHeight: "clamp(44px, min(11vmin, 8.5dvh), 80px)",
          }}
        >
          0
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={disabled || pin.length === 0}
          aria-label="Borrar último dígito"
          className={utilityClass}
          style={{ minHeight: "clamp(44px, min(11vmin, 8.5dvh), 80px)" }}
        >
          <Delete
            style={{
              width: "clamp(17px, min(4vmin, 3dvh), 30px)",
              height: "auto",
            }}
          />
        </button>
      </div>

      {!autoSubmit && (
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="min-h-[42px] w-full rounded-lg bg-[var(--brand)] px-4 text-sm font-black uppercase tracking-[0.2em] text-[var(--brand-fg)] transition-colors active:scale-[0.99] disabled:bg-white/10 disabled:text-white/30 disabled:active:scale-100 focus-visible:ring-2 focus-visible:ring-[var(--brand)] sm:min-h-[48px]"
        >
          {disabled ? "Validando" : submitLabel}
        </button>
      )}
    </div>
  );
}
