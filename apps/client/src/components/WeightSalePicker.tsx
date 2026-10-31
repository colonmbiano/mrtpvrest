import React, { useId } from 'react';
import { parseWeightInput, type WeightUnit } from '../../../../packages/config/weight-sale';
export type WeightInput = { value: string; unit: WeightUnit };
export default function WeightSalePicker({ input, pricePerKg, minKg, onChange }: {
  input: WeightInput; pricePerKg: number; minKg: number; onChange: (value: WeightInput) => void;
}) {
  const id = useId();
  const kg = parseWeightInput(input.value, input.unit, pricePerKg, minKg);
  const money = (n: number) => `$${n.toFixed(2)}`;
  const valueFor = (weight: number, unit: WeightUnit) => String(unit === 'g' ? Math.round(weight * 1000) : unit === 'pesos' ? Number((weight * pricePerKg).toFixed(2)) : weight);
  return <section className="my-4 space-y-3 rounded-2xl border p-4">
    <h3 className="font-bold">Cantidad a granel</h3>
    <p className="text-sm">Mínimo {minKg} kg · {money(minKg * pricePerKg)} · {money(pricePerKg)} por kg</p>
    <div className="flex flex-wrap gap-2" aria-label="Unidad de captura">
      {(['kg', 'g', 'pesos'] as const).map(unit => <button key={unit} type="button" aria-pressed={input.unit === unit}
        className="min-h-11 rounded-lg border px-4 font-bold" style={input.unit === unit ? { background: '#334155', color: 'white' } : undefined}
        onClick={() => onChange({ unit, value: kg == null ? '' : valueFor(kg, unit) })}>
        {unit === 'kg' ? 'Kilos' : unit === 'g' ? 'Gramos' : 'Pesos'}
      </button>)}
    </div>
    <label htmlFor={id} className="block text-sm font-semibold">{input.unit === 'pesos' ? 'Importe del producto ($)' : `Peso (${input.unit})`}</label>
    <input id={id} type="text" inputMode="decimal" value={input.value} aria-invalid={kg == null} aria-describedby={`${id}-help`}
      className="min-h-12 w-full rounded-lg border bg-transparent px-3 text-xl font-bold"
      onChange={e => onChange({ ...input, value: e.target.value })} />
    <div className="flex flex-wrap gap-2" aria-label="Cantidades rápidas">
      {[...new Set([minKg, 0.25, 0.5, 1, 1.5, 2, 3, 5].filter(n => n >= minKg))].sort((a, b) => a - b).map(weight => <button type="button" key={weight} className="min-h-11 rounded-lg border px-3 font-semibold"
        onClick={() => onChange({ ...input, value: valueFor(weight, input.unit) })}>
        {input.unit === 'pesos' ? money(weight * pricePerKg) : input.unit === 'g' ? `${weight * 1000} g` : `${weight} kg`}
      </button>)}
    </div>
    <p id={`${id}-help`} role="status" className="text-sm font-semibold">
      {kg == null ? `Ingresa al menos ${minKg} kg, ${Math.round(minKg * 1000)} g o ${money(minKg * pricePerKg)}.` : `${Math.round(kg * 1000)} g · ${money(kg * pricePerKg)} de producto`}
    </p>
    <p className="text-xs">El importe se convierte al gramo más cercano; el total se recalcula. Extras por kg, aparte.</p>
  </section>;
}
