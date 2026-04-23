'use client';

import { useMemo, useRef, useState } from 'react';
import { useCart } from '../../lib/cartStore';
import type { MockCategory } from './mockMenu';

type StoreProps = {
  id: string;
  name: string;
  logo: string | null;
  whatsappNumber: string | null;
  primaryColor: string;
};

const fmt = (n: number) => `$${n.toFixed(0)}`;

function buildWhatsappMessage(
  storeName: string,
  lines: { name: string; price: number; quantity: number }[],
  total: number
) {
  const header = `NUEVO PEDIDO - ${storeName}`;
  const body = lines
    .map(l => `- ${l.quantity}x ${l.name} (${fmt(l.price * l.quantity)})`)
    .join('\n');
  return `${header}\n${body}\nTotal: ${fmt(total)}`;
}

function normalizeWhatsapp(num: string) {
  return num.replace(/[^0-9]/g, '');
}

export default function StorefrontClient({
  store,
  categories,
}: {
  store: StoreProps;
  categories: MockCategory[];
}) {
  const lines = useCart(s => s.lines);
  const add = useCart(s => s.add);
  const remove = useCart(s => s.remove);
  const total = useCart(s => s.total());
  const quantity = useCart(s => s.quantity());

  const [activeCat, setActiveCat] = useState<string>(
    categories[0]?.id ?? ''
  );
  const catRefs = useRef<Record<string, HTMLElement | null>>({});

  const hasWhatsapp = useMemo(
    () => !!store.whatsappNumber && normalizeWhatsapp(store.whatsappNumber).length > 6,
    [store.whatsappNumber]
  );

  function scrollTo(catId: string) {
    setActiveCat(catId);
    catRefs.current[catId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function handleSendWhatsapp() {
    if (!store.whatsappNumber) return;
    const msg = buildWhatsappMessage(store.name, lines, total);
    const number = normalizeWhatsapp(store.whatsappNumber);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  }

  const primary = store.primaryColor;

  return (
    <div className="max-w-lg mx-auto relative pb-40">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white shadow-sm px-5 py-4 flex items-center gap-3">
        {store.logo && (
          <img
            src={store.logo}
            alt={store.name}
            className="h-10 w-10 object-cover rounded-full"
          />
        )}
        <div className="flex-1">
          <h1 className="text-lg font-black leading-tight">{store.name}</h1>
          <p className="text-xs text-gray-400">Pide por WhatsApp</p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-50 px-3 py-1.5 rounded-full">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-green-700">Abierto</span>
        </div>
      </header>

      {/* Category bubbles (horizontal scroll) */}
      <nav className="sticky top-[72px] z-20 bg-gray-50 border-b border-gray-100">
        <div className="flex overflow-x-auto gap-2 px-4 py-3 no-scrollbar">
          {categories.map(cat => {
            const isActive = activeCat === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => scrollTo(cat.id)}
                className="flex-none px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all"
                style={{
                  background: isActive ? primary : '#ffffff',
                  color: isActive ? '#ffffff' : '#374151',
                  border: `1px solid ${isActive ? primary : '#e5e7eb'}`,
                }}
              >
                <span className="mr-1">{cat.emoji}</span>
                {cat.name}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Menu sections */}
      <main className="px-4 pt-6 flex flex-col gap-8">
        {categories.map(cat => (
          <section
            key={cat.id}
            ref={el => {
              catRefs.current[cat.id] = el;
            }}
          >
            <h2 className="text-xl font-black mb-4 px-1">
              {cat.emoji} {cat.name}
            </h2>
            <div className="flex flex-col gap-3">
              {cat.items.map(item => {
                const line = lines.find(l => l.id === item.id);
                return (
                  <div
                    key={item.id}
                    className="bg-white rounded-3xl overflow-hidden shadow-sm flex"
                  >
                    {item.image && (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-28 h-28 object-cover flex-none"
                      />
                    )}
                    <div className="flex-1 p-3 flex flex-col">
                      <p className="font-black text-sm leading-tight">
                        {item.name}
                      </p>
                      {item.description && (
                        <p className="text-xs text-gray-400 line-clamp-2 mt-1 flex-1">
                          {item.description}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <p
                          className="font-black text-base"
                          style={{ color: primary }}
                        >
                          {fmt(item.price)}
                        </p>
                        {line ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => remove(item.id)}
                              className="w-8 h-8 rounded-full bg-gray-100 text-lg font-black active:scale-90 transition-transform"
                              aria-label={`Quitar ${item.name}`}
                            >
                              −
                            </button>
                            <span className="font-black text-sm w-5 text-center">
                              {line.quantity}
                            </span>
                            <button
                              onClick={() =>
                                add({
                                  id: item.id,
                                  name: item.name,
                                  price: item.price,
                                })
                              }
                              className="w-8 h-8 rounded-full text-white text-lg font-black active:scale-90 transition-transform"
                              style={{ background: primary }}
                              aria-label={`Agregar otro ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              add({
                                id: item.id,
                                name: item.name,
                                price: item.price,
                              })
                            }
                            className="px-4 py-2 rounded-full text-white text-xs font-black uppercase tracking-wide shadow-md active:scale-95 transition-transform"
                            style={{ background: primary }}
                          >
                            Agregar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </main>

      {/* Sticky WhatsApp footer */}
      {quantity > 0 && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 pb-5 pt-3 z-40 bg-gradient-to-t from-gray-50 via-gray-50 to-transparent">
          <button
            onClick={handleSendWhatsapp}
            disabled={!hasWhatsapp}
            className="w-full py-4 rounded-2xl font-black text-base shadow-2xl flex items-center justify-between px-6 transition-all active:scale-95 disabled:opacity-50"
            style={{ background: '#25D366', color: '#ffffff' }}
          >
            <span className="bg-white/25 rounded-xl px-2.5 py-0.5 text-sm font-black">
              {quantity}
            </span>
            <span className="uppercase tracking-wide flex items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="currentColor"
                aria-hidden
              >
                <path d="M20.5 3.5A11.8 11.8 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.7.9 3.7 1.4 5.8 1.4 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.3ZM12 21.8c-1.8 0-3.6-.5-5.1-1.4l-.4-.2-3.7 1 1-3.6-.2-.4a9.8 9.8 0 1 1 8.4 4.6Zm5.4-7.3c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.2l-1 1.2c-.2.2-.4.3-.7.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.7l.6-.7c.1-.2.2-.3.3-.5 0-.2 0-.4 0-.5 0-.1-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3.1 4.9 4.3 2.9 1.2 2.9.8 3.4.8.5 0 1.7-.7 2-1.4.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3Z" />
              </svg>
              {hasWhatsapp ? 'Pedir por WhatsApp' : 'WhatsApp no configurado'}
            </span>
            <span className="font-black">{fmt(total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
