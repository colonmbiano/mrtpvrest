'use client';

import { useState } from 'react';
import { Laptop, Users, Check, ArrowRight } from 'lucide-react';

interface DeviceStepProps {
  onSubmit: (deviceType: string) => Promise<void>;
  loading: boolean;
  error: string;
}

type DeviceTypeKey = 'CAJA' | 'MESERO';

const OPTIONS: Array<{
  key: DeviceTypeKey;
  title: string;
  desc: string;
  icon: typeof Laptop;
  accent: string;
}> = [
  {
    key: 'CAJA',
    title: 'Caja Principal',
    desc: 'POS para cobrar, abrir comandas y gestionar mesas',
    icon: Laptop,
    accent: '#E0A22A',
  },
  {
    key: 'MESERO',
    title: 'Tablet Mesero',
    desc: 'Mapa de mesas y comandas para meseros',
    icon: Users,
    accent: '#3b82f6',
  },
];
// Para vincular un KDS de cocina, instalá la APK independiente
// "MRTPV KDS" (apps/kds). El TPV ya no incluye ese rol.

export default function DeviceStep({ onSubmit, loading, error }: DeviceStepProps) {
  // Sin selección por defecto — fuerza al admin a elegir explícitamente
  // qué rol va a tener este hardware. Antes el default "CAJA" hacía que
  // admins con prisa terminaran vinculando KDS como POS por accidente.
  const [selected, setSelected] = useState<DeviceTypeKey | null>(null);

  const handleSubmit = async () => {
    if (!selected) return;
    await onSubmit(selected);
  };

  return (
    <div
      className="flex flex-col gap-6"
      style={{ fontFamily: "'Outfit', system-ui, sans-serif" }}
    >
      <div className="flex flex-col items-center text-center gap-3">
        <div className="inline-block px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-[var(--brand)] bg-[var(--brand-soft)] border border-[var(--brand)]">
          Paso 3 · Vinculación
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">
          ¿Qué será este dispositivo?
        </h1>
        <p className="text-sm font-medium text-white/55 max-w-md">
          El rol que elijas aquí es <strong>permanente</strong> hasta que reinstales
          la app. Imposible cambiarlo después sin uninstall.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const active = selected === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSelected(opt.key)}
              disabled={loading}
              className="relative w-full p-5 min-h-[88px] rounded-2xl text-left flex items-center gap-4 active:scale-[0.98] transition-transform overflow-hidden"
              style={{
                background: active ? `${opt.accent}1A` : 'rgba(255,255,255,0.04)',
                border: active
                  ? `2px solid ${opt.accent}`
                  : '1px solid rgba(255,255,255,0.10)',
                boxShadow: active
                  ? `0 20px 50px ${opt.accent}30`
                  : '0 6px 16px rgba(0,0,0,0.20)',
                opacity: loading ? 0.5 : 1,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <div
                aria-hidden
                className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px]"
                style={{ background: opt.accent, opacity: active ? 0.25 : 0 }}
              />

              <div
                className="relative w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: active ? opt.accent : 'rgba(255,255,255,0.06)',
                  color: active ? 'var(--brand-fg)' : opt.accent,
                  border: active ? 'none' : `1px solid ${opt.accent}40`,
                }}
              >
                <Icon size={26} strokeWidth={2.5} />
              </div>

              <div className="relative flex-1 min-w-0">
                <h3 className="text-lg font-black text-white tracking-tight">
                  {opt.title}
                </h3>
                <p className="text-xs font-medium text-white/55 leading-relaxed">
                  {opt.desc}
                </p>
              </div>

              <div
                className="relative w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background: active ? opt.accent : 'transparent',
                  border: active ? 'none' : '1.5px solid rgba(255,255,255,0.20)',
                }}
              >
                {active && <Check size={16} className="text-[var(--brand-fg)]" strokeWidth={3} />}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="rounded-2xl p-3 text-sm font-semibold"
          style={{
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            color: 'var(--danger)',
          }}
        >
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading || !selected}
        className="inline-flex items-center justify-center gap-2 w-full min-h-[64px] py-4 rounded-2xl text-sm font-black uppercase tracking-[0.2em] active:scale-95 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: selected ? 'var(--brand)' : 'rgba(255,255,255,0.06)',
          color: selected ? 'var(--brand-fg)' : 'rgba(255,255,255,0.50)',
          boxShadow: selected ? '0 15px 40px var(--brand-glow)' : 'none',
        }}
      >
        {loading
          ? 'Vinculando…'
          : selected
            ? <>Vincular como {OPTIONS.find((o) => o.key === selected)?.title} <ArrowRight size={16} strokeWidth={3} /></>
            : 'Selecciona un rol'}
      </button>
    </div>
  );
}
