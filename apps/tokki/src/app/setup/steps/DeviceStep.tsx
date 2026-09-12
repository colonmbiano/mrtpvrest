'use client';

import { useState } from 'react';
import { Laptop, ArrowRight } from 'lucide-react';

interface DeviceStepProps {
  onSubmit: (deviceType: string) => Promise<void>;
  loading: boolean;
  error: string;
}

type DeviceTypeKey = 'CAJA';

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
    desc: 'POS rápido para cobrar y tomar pedidos para llevar',
    icon: Laptop,
    accent: 'var(--brand)',
  },
];

export default function DeviceStep({ onSubmit, loading, error }: DeviceStepProps) {
  const [selected, setSelected] = useState<DeviceTypeKey>('CAJA');

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
          Paso 3 — Vinculación
        </div>
        <h1 className="text-3xl font-black text-[var(--text-primary)] tracking-tight">
          Confirmar dispositivo
        </h1>
        <p className="text-sm font-medium text-[var(--text-secondary)] max-w-md">
          Este dispositivo operará de manera independiente como Caja Principal.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selected === opt.key;

          return (
            <button
              key={opt.key}
              onClick={() => setSelected(opt.key)}
              disabled={loading}
              className="flex items-center gap-4 p-5 rounded-2xl border-2 text-left transition-all active:scale-[0.98]"
              style={{
                borderColor: isSelected ? opt.accent : 'var(--border)',
                background: isSelected ? 'var(--lilac-soft)' : 'var(--surface-1)',
              }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                style={{
                  background: isSelected ? opt.accent : 'var(--surface-2)',
                  color: isSelected ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <Icon size={24} />
              </div>
              <div className="flex-1">
                <h3
                  className="font-black text-lg transition-colors"
                  style={{ color: isSelected ? opt.accent : 'var(--text-primary)' }}
                >
                  {opt.title}
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {opt.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div
          className="w-full p-3 rounded-m text-sm"
          style={{ background: 'var(--danger-soft)', color: 'var(--danger)', border: '1px solid var(--danger)' }}
        >
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="mt-2 w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2"
        style={{
          background: 'var(--brand)',
          color: 'var(--brand-fg)',
          opacity: loading || !selected ? 0.5 : 1,
          cursor: loading || !selected ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        {loading ? 'Finalizando...' : 'Vincular y Continuar'}
        {!loading && <ArrowRight size={16} />}
      </button>
    </div>
  );
}
