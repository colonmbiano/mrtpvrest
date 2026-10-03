import React from "react";

type Option = { id: string; name: string; isAvailable?: boolean };
export default function QuantityOptions({ options, selected, max, onChange }: {
  options: Option[]; selected: string[]; max: number; onChange: (ids: string[]) => void;
}) {
  const change = (id: string, delta: number) => {
    if (delta > 0) { if (selected.length < max) onChange([...selected, id]); }
    else { const index = selected.lastIndexOf(id); if (index >= 0) onChange(selected.filter((_, i) => i !== index)); }
  };
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">{options.map(o => <button type="button" key={o.id} disabled={o.isAvailable === false} className="rounded-lg border px-3 py-2 font-bold disabled:opacity-40" onClick={() => onChange(Array(max).fill(o.id))}>{max} {o.name}</button>)}</div>
    <details open><summary className="cursor-pointer py-2 font-bold">Personalizar combinación</summary>
      {options.map(o => { const count = selected.filter(id => id === o.id).length; return <div key={o.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span>{o.name}{o.isAvailable === false ? " · Agotado" : ""}</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label={`Quitar ${o.name}`} disabled={count === 0} className="h-11 w-11 rounded-lg border disabled:opacity-40" onClick={() => change(o.id, -1)}>−</button>
          <span className="min-w-6 text-center font-bold" aria-live="polite">{count}</span>
          <button type="button" aria-label={`Añadir ${o.name}`} disabled={o.isAvailable === false || selected.length >= max} className="h-11 w-11 rounded-lg border disabled:opacity-40" onClick={() => change(o.id, 1)}>+</button>
        </div>
      </div>; })}
    </details>
    <p className="font-bold" aria-live="polite">Total: {selected.length} / {max}</p>
  </div>;
}
