'use client';

import { useMemo, useState } from 'react';
import { Search, ShoppingBag, Plus, Minus, X, UtensilsCrossed } from 'lucide-react';
import { useCart } from '../../lib/cartStore';
import { cldImage } from '../../lib/cloudinary';
import ProductModal, { needsModal, type StoreProduct } from '../ProductModal';
import StoreCheckout from '../StoreCheckout';
import { StoreLocaleProvider, useMoney } from '../StoreLocaleContext';

type Category = { id: string; name: string; items?: StoreProduct[] };

type Props = {
  slug: string;
  storeName: string;
  logo: string | null;
  accent: string;
  currency?: string | null;
  currencyLocale?: string | null;
  categories: Category[];
  locations: any[];
  tableLabel: string | null;
  /** El backend valida este token y resuelve la mesa real. */
  tableToken: string;
  locationId: string | null;
};

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function MesaMenu(props: Props) {
  return (
    <StoreLocaleProvider currency={props.currency} locale={props.currencyLocale}>
      <Shell {...props} />
    </StoreLocaleProvider>
  );
}

function Shell({
  slug, storeName, logo, accent, categories, locations, tableLabel, tableToken, locationId,
}: Props) {
  const fmt = useMoney();
  const lines = useCart(s => s.lines);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [modalProduct, setModalProduct] = useState<StoreProduct | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const availableCategories = useMemo(() => categories.filter(c => c.items?.length), [categories]);
  const visible = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return availableCategories
      .filter(c => terms.length > 0 || !categoryId || c.id === categoryId)
      .map(c => ({
        ...c,
        items: (c.items || []).filter(p => {
          const text = normalize(`${p.name} ${p.description || ''} ${c.name}`);
          return terms.every(term => text.includes(term));
        }),
      }))
      .filter(c => c.items.length > 0);
  }, [availableCategories, categoryId, query]);
  const counts = useMemo(() => {
    const result = new Map<string, number>();
    for (const line of lines) result.set(line.menuItemId, (result.get(line.menuItemId) || 0) + line.quantity);
    return result;
  }, [lines]);
  const resultCount = visible.reduce((sum, c) => sum + c.items.length, 0);

  const pick = (p: StoreProduct) => {
    if (needsModal(p)) { setModalProduct(p); return; }
    const price = Number(p.promoPrice ?? p.price ?? 0);
    add({ id: p.id, menuItemId: p.id, name: p.name, price, quantity: 1 });
  };

  const selectCategory = (id: string | null) => {
    setCategoryId(id);
    setQuery('');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32 text-gray-900">
      <header className="sticky top-0 z-30 border-b bg-white pt-[env(safe-area-inset-top)]" style={{ borderColor: `${accent}22` }}>
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cldImage(logo, { width: 96 }) || ''} alt="" className="h-10 w-10 shrink-0 rounded-xl object-contain" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{storeName}</p>
            <p className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: accent }}>
              <UtensilsCrossed className="h-3.5 w-3.5" />
              {tableLabel ? `Mesa ${tableLabel}` : 'Pedido en tu mesa'}
            </p>
          </div>
          <button type="button" onClick={() => setCheckoutOpen(true)}
            className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-gray-100 px-3 text-sm font-bold"
            aria-label={`Ver mi pedido, ${quantity} productos`}>
            <ShoppingBag className="h-5 w-5" />
            <span>Mi pedido</span>
            <span className="rounded-full px-2 py-0.5 text-xs text-white" style={{ background: accent }}>{quantity}</span>
          </button>
        </div>
        <div className="mx-auto max-w-3xl px-4 pb-2">
          <div className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 pl-3">
            <Search className="h-5 w-5 shrink-0 text-gray-400" />
            <input type="search" value={query} onChange={e => { setQuery(e.target.value); setCategoryId(null); }}
              aria-label="Buscar en todo el menú" placeholder="Buscar platillo, bebida o ingrediente"
              className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-sm placeholder:text-gray-500" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda" className="flex h-11 w-11 shrink-0 items-center justify-center">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <nav aria-label="Categorías del menú" className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 pb-3">
          {[{ id: null, name: 'Todo' }, ...availableCategories].map(c => (
            <button key={c.id || 'all'} type="button" onClick={() => selectCategory(c.id)}
              aria-pressed={categoryId === c.id}
              className="min-h-11 shrink-0 rounded-full border px-4 text-sm font-bold"
              style={{ background: categoryId === c.id ? accent : '#fff', color: categoryId === c.id ? '#fff' : '#374151', borderColor: categoryId === c.id ? accent : '#e5e7eb' }}>
              {c.name}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4">
        <div className="pb-1 pt-5">
          <h1 className="text-xl font-black">{query.trim() ? 'Resultados de búsqueda' : 'Elige y pide desde tu mesa'}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {query.trim() ? `${resultCount} ${resultCount === 1 ? 'producto encontrado' : 'productos encontrados'}` : 'Agrega tus favoritos. Revisa y confirma cuando estés listo.'}
          </p>
        </div>
        {visible.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-bold">{query.trim() ? `No encontramos “${query.trim()}”` : 'El menú está vacío por ahora.'}</p>
            {query.trim() && <button type="button" onClick={() => selectCategory(null)} className="mt-3 min-h-11 rounded-xl border px-4 text-sm font-bold">Ver todo el menú</button>}
          </div>
        ) : visible.map(cat => (
          <section key={cat.id} aria-label={cat.name} className="pt-5">
            <h2 className="mb-3 text-base font-black">{cat.name} <span className="ml-1 text-sm font-medium text-gray-400">{cat.items.length}</span></h2>
            <div className="space-y-3">
              {cat.items.map(p => {
                const count = counts.get(p.id) || 0;
                // Un producto personalizado puede tener varias líneas: editarlas
                // en el pedido evita quitar una preparación distinta por error.
                const directLine = lines.find(l => l.id === p.id);
                const canDecrease = !needsModal(p) && !!directLine && count === directLine.quantity;
                return <ProductRow key={p.id} product={p} accent={accent} fmt={fmt} count={count}
                  onPick={() => pick(p)} onDetails={() => setModalProduct(p)}
                  onDecrease={canDecrease ? () => remove(p.id) : undefined}
                  onReview={() => setCheckoutOpen(true)} />;
              })}
            </div>
          </section>
        ))}
      </main>

      <p role="status" className="sr-only">{quantity} productos en tu pedido. Subtotal {fmt(total)}.</p>
      {quantity > 0 && !checkoutOpen && !modalProduct && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3">
          <button type="button" onClick={() => setCheckoutOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 rounded-2xl px-5 py-3 text-white" style={{ background: accent }}>
            <span className="text-left"><span className="block text-sm font-black">Revisar pedido · {quantity}</span><span className="text-xs">Confirmas en el siguiente paso</span></span>
            <span className="text-lg font-black">{fmt(total)}</span>
          </button>
        </div>
      )}
      {modalProduct && <ProductModal product={modalProduct} accent={accent} variant="light" onClose={() => setModalProduct(null)} />}
      <StoreCheckout open={checkoutOpen} onClose={() => setCheckoutOpen(false)} slug={slug} primary={accent}
        locations={locations} minOrderAmount={0} onlinePayment={false} initialOrderType="DINE_IN"
        lockedTable={tableLabel} lockedTableToken={tableToken} lockedLocationId={locationId} />
    </div>
  );
}

function ProductRow({ product, accent, fmt, count, onPick, onDetails, onDecrease, onReview }: {
  product: StoreProduct; accent: string; fmt: (n: number) => string; count: number;
  onPick: () => void; onDetails: () => void; onDecrease?: () => void; onReview: () => void;
}) {
  const price = Number(product.promoPrice ?? product.price ?? 0);
  const img = cldImage(product.imageUrl || (product as StoreProduct & { image?: string }).image, { width: 200 });
  const customizable = !!needsModal(product);
  return (
    <article className="rounded-2xl border bg-white p-3" style={{ borderColor: count ? accent : '#e5e7eb' }}>
      <button type="button" onClick={onDetails} aria-label={`Ver detalles de ${product.name}`}
        className="flex min-h-11 w-full items-start gap-3 rounded-xl text-left">
        {img && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold leading-snug">{product.name}</h3>
          {product.description && <p className="mt-1 line-clamp-2 text-sm leading-snug text-gray-500">{product.description}</p>}
          <span className="mt-1 inline-block text-xs font-medium text-gray-500">{customizable ? 'Ver opciones y detalles' : 'Ver detalles o agregar una nota'}</span>
        </div>
      </button>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-black" style={{ color: accent }}>{product.variants?.length ? 'Desde ' : ''}{fmt(product.variants?.length ? Math.min(...product.variants.map(v => Number(v.price))) : price)}</p>
        <div className="flex items-center gap-1">
          {count > 0 && (onDecrease ? (
            <>
              <button type="button" onClick={onDecrease} aria-label={`Quitar uno de ${product.name}`} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100"><Minus className="h-4 w-4" /></button>
              <span aria-label={`${count} en tu pedido`} className="min-w-6 text-center text-sm font-black">{count}</span>
            </>
          ) : (
            <button type="button" onClick={onReview} aria-label={`Editar ${count} de ${product.name} en mi pedido`} className="min-h-11 rounded-xl bg-gray-100 px-3 text-xs font-bold">{count} en tu pedido</button>
          ))}
          <button type="button" onClick={onPick} aria-label={`${customizable ? 'Elegir opciones de' : 'Agregar'} ${product.name}`}
            className="flex min-h-11 items-center justify-center gap-1 rounded-xl px-3 text-sm font-bold text-white" style={{ background: accent }}>
            <Plus className="h-4 w-4" />{customizable ? 'Elegir' : 'Agregar'}
          </button>
        </div>
      </div>
    </article>
  );
}
