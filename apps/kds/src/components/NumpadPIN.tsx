"use client";
import React, { useState } from "react";
import { Delete } from "lucide-react";

interface Props {
  onSubmit: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  length?: number;
}

export default function NumpadPIN({ onSubmit, disabled, length = 4 }: Props) {
  const [pin, setPin] = useState("");

  const press = (d: string) => {
    if (disabled) return;
    if (pin.length >= length) return;
    const next = pin + d;
    setPin(next);
    if (next.length === length) {
      onSubmit(next);
      setTimeout(() => setPin(""), 200);
    }
  };

  const erase = () => setPin((p) => p.slice(0, -1));
  const clear = () => setPin("");

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <span
            key={i}
            className="w-5 h-5 rounded-full border-2"
            style={{
              borderColor: pin.length > i ? "#ffb84d" : "rgba(255,255,255,0.20)",
              background: pin.length > i ? "#ffb84d" : "transparent",
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        {["1","2","3","4","5","6","7","8","9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            disabled={disabled}
            className="h-16 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white active:scale-95 transition-transform disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="h-16 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 text-xs font-black uppercase tracking-widest text-white/55 active:scale-95 transition-transform disabled:opacity-40"
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={() => press("0")}
          disabled={disabled}
          className="h-16 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white active:scale-95 transition-transform disabled:opacity-40"
        >
          0
        </button>
        <button
          type="button"
          onClick={erase}
          disabled={disabled}
          className="h-16 min-h-[64px] rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/55 active:scale-95 transition-transform disabled:opacity-40"
          aria-label="Borrar último"
        >
          <Delete size={20} />
        </button>
      </div>
    </div>
  );
}
