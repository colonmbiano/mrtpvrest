import React, { useId, useState } from 'react';

const PRESETS = [
  { kg: '0.25', label: '250 g' },
  { kg: '0.5', label: '500 g' },
  { kg: '1', label: '1 kg' },
  { kg: '2', label: '2 kg' },
] as const;

export default function MinimumWeightInput({
  value,
  pricePerKg,
  onChange,
}: {
  value: string | null;
  pricePerKg: number;
  onChange: (value: string | null) => void;
}) {
  const baseId = useId();
  const checkboxId = `${baseId}-enabled`;
  const inputId = `${baseId}-min-kg`;
  const hintId = `${baseId}-hint`;
  const statusId = `${baseId}-status`;
  const [touched, setTouched] = useState(false);

  const normalized = value == null ? '' : value.trim().replace(',', '.');
  const kg = normalized ? Number(normalized) : NaN;
  const valid =
    Number.isFinite(kg) &&
    kg >= 0.001 &&
    kg <= 10000 &&
    Math.abs(kg * 1000 - Math.round(kg * 1000)) <= 1e-7;
  const safePrice = Number.isFinite(pricePerKg) && pricePerKg > 0 ? pricePerKg : 0;

  return (
    <fieldset className="space-y-3 rounded-xl border border-bd p-4">
      <legend className="sr-only">Mínimo de compra a granel</legend>
      <label htmlFor={checkboxId} className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold text-tx-pri">
        <input
          id={checkboxId}
          name="hasMinWeight"
          type="checkbox"
          checked={value !== null}
          className="h-5 w-5 accent-[var(--brand)]"
          onChange={(e) => {
            setTouched(false);
            onChange(e.target.checked ? '1' : null);
          }}
        />
        <span>Activar mínimo de compra</span>
      </label>

      {value !== null ? (
        <div className="space-y-2.5">
          <div>
            <label htmlFor={inputId} className="block text-sm font-semibold text-tx-pri">
              Compra mínima (kg)
            </label>
            <span id={hintId} className="block text-xs text-tx-mut">
              Desde 0.001 kg (1 g) hasta 10,000 kg (máximo 3 decimales).
            </span>
          </div>
          <input
            id={inputId}
            name="minWeightKg"
            type="number"
            inputMode="decimal"
            min="0.001"
            max="10000"
            step="0.001"
            required
            value={value}
            aria-describedby={`${hintId} ${statusId}`}
            aria-invalid={touched && !valid ? true : undefined}
            onBlur={() => setTouched(true)}
            onWheel={(e) => e.currentTarget.blur()}
            onChange={(e) => onChange(e.target.value)}
            className="min-h-12 w-full rounded-lg border border-bd bg-transparent px-3 text-base font-semibold text-tx-pri"
            style={touched && !valid ? { borderColor: '#dc2626' } : undefined}
          />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const active = valid && Math.abs(kg - Number(preset.kg)) < 1e-6;
              return (
                <button
                  key={preset.kg}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setTouched(false);
                    onChange(preset.kg);
                  }}
                  className="min-h-11 rounded-lg border border-bd px-3 text-sm font-semibold text-tx-pri transition-colors"
                  style={
                    active
                      ? { background: 'var(--brand)', color: 'var(--brand-fg, #000)', borderColor: 'transparent' }
                      : undefined
                  }
                >
                  {preset.label} ({preset.kg} kg)
                </button>
              );
            })}
          </div>
          <p id={statusId} role="status" className="text-sm font-medium text-tx-sec">
            {valid
              ? `${Math.round(kg * 1000)} g · $${(kg * safePrice).toFixed(2)} al precio actual`
              : 'Ingresa un peso mínimo entre 0.001 y 10,000 kg.'}
          </p>
          <p className="text-xs text-tx-mut">
            El mínimo se guarda en peso; su equivalente en pesos se ajusta automáticamente al precio por kg.
          </p>
        </div>
      ) : (
        <p className="text-sm text-tx-mut">Sin mínimo obligatorio; permite vender desde 1 gramo.</p>
      )}
    </fieldset>
  );
}
