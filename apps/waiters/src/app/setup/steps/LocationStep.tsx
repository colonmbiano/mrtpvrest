'use client';

import { Building2 } from 'lucide-react';
import { useState } from 'react';

interface LocationStepProps {
  locations: Array<{ id: string; name: string }>;
  onSelect: (locationId: string) => Promise<void>;
  loading: boolean;
  error: string;
}

export default function LocationStep({
  locations,
  onSelect,
  loading,
  error,
}: LocationStepProps) {
  const [selected, setSelected] = useState(locations[0]?.id || '');

  const handleSubmit = async () => {
    await onSelect(selected);
  };

  return (
    <div className="flex flex-col items-center text-center gap-8">
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-m flex items-center justify-center"
          style={{ background: 'var(--primary-soft)', color: 'var(--primary)' }}
        >
          <Building2 size={32} />
        </div>
        <h1 className="text-2xl font-bold mt-4" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-primary)' }}>
          Seleccionar Sucursal
        </h1>
        <p className="mt-2 text-base" style={{ color: 'var(--foreground-secondary)' }}>
          Elige la sucursal donde se instalará esta terminal
        </p>
      </div>

      <div className="w-full text-left">
        <label className="block text-sm font-medium mb-3" style={{ color: 'var(--foreground)' }}>
          Sucursal
        </label>
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="w-full rounded-m text-base outline-none p-4 transition-all"
          style={{
            background: 'var(--muted)',
            color: 'var(--foreground)',
            border: '1px solid var(--border)',
          }}
        >
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
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
        className="w-full py-4 rounded-m font-bold text-base transition-all"
        style={{
          background: 'var(--primary)',
          color: '#000',
          opacity: loading ? 0.5 : 1,
          cursor: loading ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--shadow-glow)',
        }}
      >
        {loading ? 'Cargando…' : 'Continuar'}
      </button>
    </div>
  );
}
