'use client';

import { useMemo, useState } from 'react';
import { useCart } from '../lib/cartStore';

type Variant = { id: string; name: string; price: number };
type Modifier = { id: string; name: string; priceAdd: number };
type Complement = { id: string; name: string; price: number };
type ModifierGroup = {
  id: string; name: string; required?: boolean; multiSelect?: boolean;
  minSelection?: number; maxSelection?: number; modifiers: Modifier[];
};
export type StoreProduct = {
  id: string; name: string; description?: string; price: number;
  isPromo?: boolean; promoPrice?: number; imageUrl?: string | null;
  variants?: Variant[]; modifierGroups?: ModifierGroup[]; complements?: Complement[];
};

// Los complementos viajan dentro de modifierIds con este prefijo; el backend
// (store.routes.js) los separa, valida y cobra como extras del item.
const COMPLEMENT_PREFIX = 'complement:';

type ProductModalProps = {
  product: StoreProduct;
  accent?: string;
  variant?: 'light' | 'dark';
  onClose: () => void;
};

// ¿El producto necesita personalización (abrir modal) o se puede agregar directo?
export function needsModal(p: StoreProduct) {
  return (p.variants && p.variants.length > 0)
    || (p.modifierGroups && p.modifierGroups.length > 0)
    || (p.complements && p.complements.length > 0);
}

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`;

export default function ProductModal({ product, accent = '#ff5c35', variant = 'light', onClose }: ProductModalProps) {
  const add = useCart(s => s.add);
  const dark = variant === 'dark';

  const variants = product.variants || [];
  const groups = product.modifierGroups || [];
  const complements = product.complements || [];
  const basePromo = product.isPromo && product.promoPrice ? product.promoPrice : product.price;

  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [selected, setSelected] = useState<Record<string, string[]>>({}); // groupId -> modifierIds
  const [selectedComplements, setSelectedComplements] = useState<string[]>([]); // complementIds
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');

  const basePrice = variantId ? (variants.find(v => v.id === variantId)?.price ?? basePromo) : basePromo;

  const allMods = useMemo(() => groups.flatMap(g => g.modifiers), [groups]);
  const modifiersAdd = useMemo(() => {
    const ids = Object.values(selected).flat();
    return ids.reduce((s, id) => s + (allMods.find(m => m.id === id)?.priceAdd || 0), 0);
  }, [selected, allMods]);
  const complementsAdd = useMemo(
    () => selectedComplements.reduce((s, id) => s + (complements.find(c => c.id === id)?.price || 0), 0),
    [selectedComplements, complements],
  );

  const unitPrice = basePrice + modifiersAdd + complementsAdd;

  const toggleMod = (g: ModifierGroup, modId: string) => {
    setError('');
    setSelected(prev => {
      const cur = prev[g.id] || [];
      if (g.multiSelect) {
        if (cur.includes(modId)) return { ...prev, [g.id]: cur.filter(x => x !== modId) };
        if (g.maxSelection && g.maxSelection > 0 && cur.length >= g.maxSelection) return prev; // tope alcanzado
        return { ...prev, [g.id]: [...cur, modId] };
      }
      // single-select (radio)
      return { ...prev, [g.id]: cur.includes(modId) ? [] : [modId] };
    });
  };

  const toggleComplement = (id: string) => {
    setError('');
    setSelectedComplements(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id],
    );
  };

  const handleAdd = () => {
    // Validaciones de grupos requeridos / mínimos
    for (const g of groups) {
      const cur = selected[g.id] || [];
      if (g.required && cur.length === 0) { setError(`Selecciona una opción en "${g.name}".`); return; }
      if (g.minSelection && g.minSelection > 0 && cur.length < g.minSelection) {
        setError(`Elige al menos ${g.minSelection} en "${g.name}".`); return;
      }
    }
    const modifierIds = Object.values(selected).flat();
    // Complementos prefijados para que el backend los distinga de modificadores.
    const complementPayloadIds = selectedComplements.map(id => `${COMPLEMENT_PREFIX}${id}`);
    const payloadIds = [...modifierIds, ...complementPayloadIds];
    const variantName = variantId ? variants.find(v => v.id === variantId)?.name : null;
    const modNames = modifierIds.map(id => allMods.find(m => m.id === id)?.name).filter(Boolean);
    const complementNames = selectedComplements.map(id => complements.find(c => c.id === id)?.name).filter(Boolean);
    const extraNames = [...modNames, ...complementNames];
    const displayName = [product.name, variantName ? `(${variantName})` : '', extraNames.length ? `· ${extraNames.join(', ')}` : '']
      .filter(Boolean).join(' ');
    const key = `${product.id}|${variantId || ''}|${[...payloadIds].sort().join(',')}`;
    add({ id: key, menuItemId: product.id, name: displayName, price: unitPrice, variantId, modifierIds: payloadIds, quantity: qty });
    onClose();
  };

  const surface = dark ? '#141417' : '#ffffff';
  const subText = dark ? '#FFFFFF70' : '#9ca3af';
  const chip = dark ? '#FFFFFF0c' : '#f3f4f6';
  const textColor = dark ? '#ffffff' : '#111827';

  return (
    <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: surface, color: textColor }} onClick={e => e.stopPropagation()}>

        {product.imageUrl && (
          <div className="relative w-full h-44 shrink-0">
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            <button onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">✕</button>
          </div>
        )}

        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>{product.name}</h2>
              {product.description && <p className="text-sm mt-1" style={{ color: subText }}>{product.description}</p>}
            </div>
            {!product.imageUrl && (
              <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center" style={{ background: chip }}>✕</button>
            )}
          </div>

          {/* Variantes */}
          {variants.length > 0 && (
            <div className="mt-5">
              <p className="text-[11px] font-black uppercase tracking-widest mb-2" style={{ color: subText }}>Tamaño / Opción</p>
              <div className="space-y-2">
                {variants.map(v => {
                  const on = variantId === v.id;
                  return (
                    <button key={v.id} onClick={() => setVariantId(v.id)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all"
                      style={{ borderColor: on ? accent : (dark ? '#FFFFFF14' : '#e5e7eb'), background: on ? `${accent}14` : 'transparent' }}>
                      <span className="font-bold text-sm">{v.name}</span>
                      <span className="font-bold text-sm" style={{ color: accent }}>{fmt(v.price)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Grupos de modificadores */}
          {groups.map(g => (
            <div key={g.id} className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: subText }}>{g.name}</p>
                <span className="text-[10px] font-bold" style={{ color: subText }}>
                  {g.required ? 'Obligatorio' : 'Opcional'}{g.multiSelect && g.maxSelection ? ` · máx ${g.maxSelection}` : ''}
                </span>
              </div>
              <div className="space-y-2">
                {g.modifiers.map(m => {
                  const on = (selected[g.id] || []).includes(m.id);
                  return (
                    <button key={m.id} onClick={() => toggleMod(g, m.id)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all"
                      style={{ borderColor: on ? accent : (dark ? '#FFFFFF14' : '#e5e7eb'), background: on ? `${accent}14` : 'transparent' }}>
                      <span className="font-bold text-sm flex items-center gap-2">
                        <span className={`w-4 h-4 rounded-${g.multiSelect ? 'md' : 'full'} border-2 flex items-center justify-center`}
                          style={{ borderColor: on ? accent : (dark ? '#FFFFFF40' : '#cbd5e1'), background: on ? accent : 'transparent' }}>
                          {on && <span className="text-white text-[10px]">✓</span>}
                        </span>
                        {m.name}
                      </span>
                      {m.priceAdd > 0 && <span className="text-sm font-bold" style={{ color: subText }}>+{fmt(m.priceAdd)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Extras / Acompañamientos (complementos) */}
          {complements.length > 0 && (
            <div className="mt-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-black uppercase tracking-widest" style={{ color: subText }}>Extras / Acompañamientos</p>
                <span className="text-[10px] font-bold" style={{ color: subText }}>Opcional</span>
              </div>
              <div className="space-y-2">
                {complements.map(c => {
                  const on = selectedComplements.includes(c.id);
                  return (
                    <button key={c.id} onClick={() => toggleComplement(c.id)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all"
                      style={{ borderColor: on ? accent : (dark ? '#FFFFFF14' : '#e5e7eb'), background: on ? `${accent}14` : 'transparent' }}>
                      <span className="font-bold text-sm flex items-center gap-2">
                        <span className="w-4 h-4 rounded-md border-2 flex items-center justify-center"
                          style={{ borderColor: on ? accent : (dark ? '#FFFFFF40' : '#cbd5e1'), background: on ? accent : 'transparent' }}>
                          {on && <span className="text-white text-[10px]">✓</span>}
                        </span>
                        {c.name}
                      </span>
                      {c.price > 0 && <span className="text-sm font-bold" style={{ color: subText }}>+{fmt(c.price)}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-red-500 text-xs font-bold mt-4">{error}</p>}
        </div>

        {/* Footer: cantidad + agregar */}
        <div className="p-5 shrink-0 flex items-center gap-3" style={{ borderTop: `1px solid ${dark ? '#FFFFFF14' : '#f0f0f0'}` }}>
          <div className="flex items-center gap-2 rounded-2xl px-2 py-2" style={{ background: chip }}>
            <button onClick={() => setQty(q => Math.max(1, q - 1))} className="w-8 h-8 font-bold text-lg">−</button>
            <span className="w-6 text-center font-bold">{qty}</span>
            <button onClick={() => setQty(q => q + 1)} className="w-8 h-8 font-bold text-lg">+</button>
          </div>
          <button onClick={handleAdd}
            className="flex-1 py-4 rounded-2xl font-bold uppercase tracking-widest text-white flex items-center justify-center gap-2 active:scale-95 transition-all"
            style={{ background: accent }}>
            Agregar · {fmt(unitPrice * qty)}
          </button>
        </div>
      </div>
    </div>
  );
}
