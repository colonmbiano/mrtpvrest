'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type {
  TestGroup, TestProduct, TestSelection, TestStore,
} from '@/lib/marketplace-test-order';

const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

type CartLine = {
  key: string; productName: string; unitCents: number;
  options: string[]; selection: TestSelection;
};

function ProductTile({ product, add }: { product: TestProduct; add: (line: CartLine) => void }) {
  const [variantId, setVariantId] = useState(product.variants[0]?.id || '');
  const [choices, setChoices] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(product.groups.map(g => [g.id, g.options.slice(0, g.min).map(o => o.id)])),
  );
  const variant = product.variants.find(v => v.id === variantId);
  const selected = product.groups.flatMap(g => g.options.filter(o => (choices[g.id] || []).includes(o.id)));
  const unitCents = (variant ? variant.priceCents : product.priceCents) +
    selected.reduce((v, o) => v + o.priceCents, 0);
  const valid = !product.unsupported && unitCents > 0
    && (!product.variants.length || Boolean(variant))
    && product.groups.every(g => (choices[g.id] || []).length >= g.min
      && (choices[g.id] || []).length <= g.max);
  const chooseOne = (group: TestGroup, id: string) =>
    setChoices(old => ({ ...old, [group.id]: id ? [id] : [] }));
  const chooseMany = (group: TestGroup, id: string) =>
    setChoices(old => {
      const prev = old[group.id] || [];
      const next = prev.includes(id) ? prev.filter(x => x !== id)
        : prev.length < group.max ? [...prev, id] : prev;
      return { ...old, [group.id]: next };
    });
  const options = [variant?.name, ...selected.map(o => o.name)].filter((v): v is string => Boolean(v));
  const selection: TestSelection = { productId: product.id, quantity: 1, variantId: variant?.id,
    modifierIds: selected.map(o => o.id) };

  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-[16/9] bg-gradient-to-tr from-orange-100 via-white to-green-100">
        {product.imageUrl ? (
          <Image src={product.imageUrl} alt={product.name} fill unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1100px) 45vw, 30vw"
            className="object-cover" />
        ) : <div className="grid h-full place-items-center text-6xl" aria-hidden="true">🍽️</div>}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div><p className="text-[11px] font-semibold uppercase text-green-700">{product.category}</p>
          <h3 className="text-lg font-extrabold text-slate-900">{product.name}</h3>
          {product.description && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{product.description}</p>}
        </div>
        {product.variants.length > 0 && (
          <label className="grid gap-1 text-sm font-semibold text-slate-700">Tamaño o presentación
            <select value={variantId} onChange={e => setVariantId(e.target.value)}
              className="min-h-11 rounded-xl border border-slate-300 bg-white px-3">
              {product.variants.map(v => (
                <option key={v.id} value={v.id}>{v.name} · {money(v.priceCents)}</option>
              ))}
            </select>
          </label>
        )}
        {product.groups.map(group => (
          <div key={group.id} className="grid gap-1 text-sm">
            <label className="font-semibold text-slate-700">
              {group.name}{group.min > 0 ? ' *' : ' (opcional)'}
            </label>
            {group.max === 1 ? (
              <select value={choices[group.id]?.[0] || ''} onChange={e => chooseOne(group, e.target.value)}
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-2">
                {group.min === 0 && <option value="">Sin extra</option>}
                {group.options.map(o => <option key={o.id} value={o.id}>
                  {o.name}{o.priceCents ? ' +' + money(o.priceCents) : ''}
                </option>)}
              </select>
            ) : (
              <div className="flex flex-wrap gap-2">
                {group.options.map(o => (
                  <label key={o.id} className="flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-2 text-xs">
                    <input type="checkbox" checked={(choices[group.id] || []).includes(o.id)}
                      onChange={() => chooseMany(group, o.id)} />
                    {o.name}{o.priceCents ? ' +' + money(o.priceCents) : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
          <span className="font-extrabold text-orange-600">{money(unitCents)}</span>
          <button type="button" disabled={!valid} onClick={() =>
            add({ key: JSON.stringify([product.id, variant?.id || '', [...selection.modifierIds].sort()]),
              productName: product.name, unitCents, options, selection })}
            className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-40">
            {product.unsupported ? 'No disponible' : 'Agregar +'}
          </button>
        </div>
      </div>
    </article>
  );
}

export default function MarketplaceFirstOrder({ store }: { store: TestStore }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const categories = useMemo(() => Array.from(new Set(store.products.map(p => p.category))), [store.products]);
  const visible = store.products.filter(p =>
    (!category || p.category === category)
    && (!search || (p.name + ' ' + p.category).toLowerCase().includes(search.toLowerCase())));
  const total = cart.reduce((sum, line) => sum + line.unitCents * line.selection.quantity, 0);
  const count = cart.reduce((sum, line) => sum + line.selection.quantity, 0);

  const add = (line: CartLine) => {
    setCart(prev => {
      const found = prev.find(p => p.key === line.key);
      if (!found) return prev.length >= 15 ? prev : [...prev, line];
      if (found.selection.quantity >= 10) return prev;
      return prev.map(p => p.key === line.key ? { ...p,
        selection: { ...p.selection, quantity: p.selection.quantity + 1 } } : p);
    });
    setMessage('Producto añadido al carrito de prueba.');
  };
  const remove = (key: string) => setCart(prev => prev.filter(p => p.key !== key));
  const update = (key: string, n: number) => setCart(prev => prev.map(line =>
    line.key !== key ? line : { ...line,
      selection: { ...line.selection, quantity: Math.max(1, Math.min(10, n)) } }));
  const checkout = async () => {
    if (!cart.length || submitting) return;
    setSubmitting(true); setMessage('');
    try {
      const result = await fetch('/api/pedido-prueba', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: store.slug, items: cart.map(line => line.selection) }),
      });
      const json: unknown = await result.json();
      if (!result.ok || !json || typeof json !== 'object' || !('id' in json)
        || typeof json.id !== 'string') throw new Error('El pedido no pudo validarse. Revisa tus opciones.');
      window.location.assign('/pedido-prueba/' + json.id);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Error al guardar el pedido de prueba.');
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f8faf8] pb-24 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <Link href="/" className="text-sm font-bold text-green-700">← Marketplace</Link>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-extrabold text-amber-800">PRUEBA · SIN COBROS</span>
          <a href="#carrito" className="rounded-xl bg-orange-600 px-3 py-2 text-sm font-bold text-white">
            🛒 {count} · {money(total)}
          </a>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-7 lg:grid-cols-[minmax(0,1fr)_350px]">
        <section>
          <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              {store.logoUrl && <div className="relative h-20 w-20 shrink-0">
                <Image src={store.logoUrl} alt="" fill unoptimized sizes="80px" className="rounded-2xl object-contain" />
              </div>}
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider text-green-700">Tienda con catálogo real</p>
                <h1 className="text-2xl font-black sm:text-3xl">{store.name}</h1>
                <p className="mt-1 text-sm text-slate-500">{store.products.length} productos publicados</p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              Esta es una simulación local: las imágenes, productos y precios provienen de la tienda real,
              pero <strong>el pedido NO llegará a cocina ni se cobrará</strong>.
            </p>
          </div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row">
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar hamburguesa, matcha..."
              aria-label="Buscar productos" className="min-h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4" />
            <select value={category} onChange={e => setCategory(e.target.value)} aria-label="Categoría"
              className="min-h-12 rounded-xl border border-slate-200 bg-white px-3">
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <p className="mb-3 text-sm font-semibold text-slate-500">{visible.length} productos</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map(p => <ProductTile key={p.id} product={p} add={add} />)}
          </div>
        </section>
        <aside id="carrito" className="self-start scroll-mt-24 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-20">
          <h2 className="text-xl font-black">🛒 Tu primer pedido</h2>
          <p className="mt-1 text-sm text-slate-500">Solo para probar el flujo. Modalidad: recoger en tienda.</p>
          {cart.length ? <div className="mt-4 space-y-4">
            {cart.map(l => <div key={l.key} className="border-b pb-3">
              <div className="flex justify-between gap-2">
                <strong className="text-sm">{l.productName}</strong>
                <button className="text-xs font-bold text-red-600" onClick={() => remove(l.key)}>Quitar</button>
              </div>
              {l.options.length > 0 && <p className="mt-1 text-xs text-slate-500">{l.options.join(', ')}</p>}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button className="rounded bg-slate-100 px-2" aria-label="Disminuir cantidad"
                    onClick={() => update(l.key, l.selection.quantity - 1)}>−</button>
                  <span className="tabular-nums">{l.selection.quantity}</span>
                  <button className="rounded bg-slate-100 px-2" aria-label="Aumentar cantidad"
                    onClick={() => update(l.key, l.selection.quantity + 1)}>+</button>
                </div>
                <span className="text-sm font-bold">{money(l.unitCents * l.selection.quantity)}</span>
              </div>
            </div>)}
          </div> : <p className="my-8 rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">
            Agrega un producto del menú para comenzar.
          </p>}
          <div className="mt-4 flex justify-between border-t pt-4 font-black">
            <span>Total de prueba</span><span>{money(total)}</span>
          </div>
          <button onClick={checkout} disabled={!cart.length || submitting}
            className="mt-4 min-h-12 w-full rounded-xl bg-green-700 px-4 font-extrabold text-white hover:bg-green-800 disabled:opacity-40">
            {submitting ? 'Validando...' : 'Crear primer pedido de prueba'}
          </button>
          <p className="mt-2 text-center text-xs text-slate-500">
            No se solicita tarjeta, teléfono ni domicilio. No se envía nada a ningún negocio.
          </p>
          {message && <p className="mt-3 text-sm font-semibold text-orange-700" role="status">{message}</p>}
        </aside>
      </div>
    </main>
  );
}
