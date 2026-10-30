'use client';

import { useCallback, useMemo, useState, useSyncExternalStore } from 'react';
import { TEST_STORES, type TestSelection, type TestStoreSlug } from './marketplace-test-order';

export type MultiCartLine = {
  key: string; slug: TestStoreSlug; storeName: string;
  productName: string; unitCents: number;
  options: string[]; selection: TestSelection;
};
export const MULTI_CART_STORAGE_KEY = 'mrtpvrest:marketplace-test-multicart-v1';
const CART_CHANGED = 'marketplace-local-multicart-changed';

function safeCart(raw: unknown): MultiCartLine[] {
  if (!Array.isArray(raw)) return [];
  const result: MultiCartLine[] = [];
  const seen = new Set<string>();
  for (const row of raw.slice(0, 25)) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const v = row as Record<string, unknown>;
    const slug = v.slug;
    const selection = v.selection;
    if (typeof slug !== 'string' || !TEST_STORES.some(s => s === slug)
      || typeof v.key !== 'string' || typeof v.productName !== 'string'
      || typeof v.storeName !== 'string' || typeof v.unitCents !== 'number'
      || !Number.isFinite(v.unitCents) || v.unitCents <= 0
      || !selection || typeof selection !== 'object' || Array.isArray(selection)) continue;
    const s = selection as Record<string, unknown>;
    if (typeof s.productId !== 'string' || !Array.isArray(s.modifierIds)
      || s.modifierIds.some(id => typeof id !== 'string')
      || typeof s.quantity !== 'number' || !Number.isInteger(s.quantity)
      || s.quantity < 1 || s.quantity > 10) continue;
    const key = JSON.stringify([slug, s.productId,
      typeof s.variantId === 'string' ? s.variantId : '',
      [...s.modifierIds].sort()]);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      key, slug: slug as TestStoreSlug,
      storeName: v.storeName.slice(0, 150), productName: v.productName.slice(0, 150),
      unitCents: v.unitCents, options: Array.isArray(v.options)
        ? v.options.filter((x): x is string => typeof x === 'string').slice(0, 35) : [],
      selection: {
        productId: s.productId,
        ...(typeof s.variantId === 'string' ? { variantId: s.variantId } : {}),
        modifierIds: [...s.modifierIds] as string[], quantity: s.quantity,
      },
    });
  }
  return result;
}

function snapshot(): string {
  if (typeof window === 'undefined') return '[]';
  try { return window.localStorage.getItem(MULTI_CART_STORAGE_KEY) || '[]'; }
  catch { return '[]'; }
}
function read(): MultiCartLine[] {
  try { return safeCart(JSON.parse(snapshot())); } catch { return []; }
}
function subscribe(notify: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === MULTI_CART_STORAGE_KEY) notify();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CART_CHANGED, notify);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CART_CHANGED, notify);
  };
}
function save(lines: MultiCartLine[]): void {
  window.localStorage.setItem(MULTI_CART_STORAGE_KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(CART_CHANGED));
}

export function useMarketplaceMultiCart() {
  // SSR sees empty cart; hydration reads browser storage without cascading effects.
  const raw = useSyncExternalStore(subscribe, snapshot, () => '[]');
  const lines = useMemo(() => {
    try { return safeCart(JSON.parse(raw)); } catch { return []; }
  }, [raw]);
  const [message, setMessage] = useState('');

  const add = useCallback((line: MultiCartLine) => {
    const prev = read();
    const key = JSON.stringify([line.slug, line.selection.productId,
      line.selection.variantId || '', [...line.selection.modifierIds].sort()]);
    const current = prev.find(x => x.key === key);
    if (current) {
      if (current.selection.quantity >= 10) {
        setMessage('Máximo 10 unidades por producto y presentación.');
        return;
      }
      save(prev.map(x => x.key === key ? {
        ...x, selection: { ...x.selection, quantity: x.selection.quantity + 1 },
      } : x));
    } else {
      if (prev.length >= 25 || prev.filter(x => x.slug === line.slug).length >= 15) {
        setMessage('Carrito completo: máximo 15 artículos distintos por tienda.');
        return;
      }
      save([...prev, { ...line, key }]);
    }
    setMessage('Producto agregado al carrito compartido.');
  }, []);
  const remove = useCallback((key: string) =>
    save(read().filter(x => x.key !== key)), []);
  const update = useCallback((key: string, quantity: number) =>
    save(read().map(x => x.key === key ? {
      ...x, selection: { ...x.selection, quantity: Math.max(1, Math.min(10, quantity)) },
    } : x)), []);
  const clear = useCallback(() => save([]), []);

  const count = useMemo(() => lines.reduce((sum, l) => sum + l.selection.quantity, 0), [lines]);
  const totalCents = useMemo(() => lines.reduce((sum, l) => sum + l.unitCents * l.selection.quantity, 0), [lines]);
  const stores = useMemo(() => TEST_STORES.map(slug => ({
    slug, lines: lines.filter(l => l.slug === slug),
  })).filter(x => x.lines.length), [lines]);
  return { lines, ready: true, message, setMessage, add, remove, update, clear, count, totalCents, stores };
}
