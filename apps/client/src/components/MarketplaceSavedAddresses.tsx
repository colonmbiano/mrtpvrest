'use client';

// Direcciones guardadas del comprador en el marketplace (libreta v1). Elegir una llena
// la dirección y el punto del mapa del checkout; al confirmar, el checkout la guarda de
// nuevo y el servidor devuelve la misma fila (no se duplica).
import { useEffect, useState } from 'react';
import { deleteAddress, listAddresses, type V1Address } from '../lib/marketplaceV1Checkout';

type Props = {
  apiUrl: string | null;
  primary: string;
  // Dirección y punto que el checkout tiene ahora, para marcar la guardada que coincide.
  current: { address: string; coords: { lat: number; lng: number } | null };
  onPick: (address: V1Address) => void;
};

export default function MarketplaceSavedAddresses({ apiUrl, primary, current, onPick }: Props) {
  const [addresses, setAddresses] = useState<V1Address[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    // Sin libreta disponible el checkout sigue con la dirección escrita a mano.
    listAddresses(apiUrl).then(result => { if (!stopped && Array.isArray(result)) setAddresses(result); });
    return () => { stopped = true; };
  }, [apiUrl]);

  if (addresses.length === 0) return null;
  const typed = current.address.replace(/\s+/g, ' ').trim();
  const isCurrent = (a: V1Address) => a.address === typed && a.lat === current.coords?.lat && a.lng === current.coords?.lng;

  const remove = async (id: string) => {
    setRemoving(id);
    setError('');
    const result = await deleteAddress(apiUrl, id);
    setRemoving(null);
    if (result === true) setAddresses(list => list.filter(a => a.id !== id));
    else setError(result.message);
  };

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs font-bold text-gray-500">Mis direcciones</p>
      <ul className="space-y-2">
        {addresses.map(a => {
          const active = isCurrent(a);
          return (
            <li key={a.id} className="flex items-center gap-2">
              <button type="button" onClick={() => onPick(a)} aria-pressed={active}
                className="min-w-0 flex-1 truncate rounded-2xl border-2 px-4 py-3 text-left text-sm font-bold transition-all"
                style={{ borderColor: active ? primary : '#e5e7eb', background: active ? `${primary}14` : 'transparent', color: active ? primary : '#374151' }}>
                📍 {a.address}
              </button>
              <button type="button" onClick={() => remove(a.id)} disabled={removing === a.id} aria-label={`Quitar ${a.address}`}
                className="shrink-0 rounded-xl px-3 py-3 text-xs font-bold text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50">
                Quitar
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p role="alert" className="px-1 text-xs font-bold text-red-500">{error}</p>}
    </div>
  );
}
