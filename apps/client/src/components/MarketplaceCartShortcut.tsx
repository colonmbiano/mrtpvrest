'use client';
import Link from 'next/link';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { useMarketplaceMultiCart } from '@/lib/marketplace-multi-cart';

const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

export default function MarketplaceCartShortcut() {
  const cart = useMarketplaceMultiCart();
  if (!cart.lines.length) return null;
  const href = '/comercio/' + cart.stores[0].slug + '#carrito';
  return <div className="mx-auto mt-3 max-w-[1380px] px-4 sm:px-6">
    <Link href={href}
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-200 bg-white px-4 py-3 text-sm shadow-sm hover:bg-green-50">
      <span className="flex items-center gap-2 font-extrabold text-green-800">
        <ShoppingCart className="h-5 w-5" aria-hidden="true" />
        Tu carrito: {cart.count} producto{cart.count === 1 ? '' : 's'} de {cart.stores.length} tienda{cart.stores.length === 1 ? '' : 's'}
      </span>
      <span className="inline-flex items-center gap-2 font-extrabold text-orange-700">
        {money(cart.totalCents)} · Ver carrito <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </span>
    </Link>
  </div>;
}
