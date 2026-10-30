// Barra del marketplace sobre el storefront: mismo lenguaje visual que la
// portada (datos de entrega en chips) sin reemplazar el tema que eligió el dueño.
// Estática a propósito: los headers de los temas son sticky y quedan debajo.
// "Volver" puede ser navegación SPA: el catálogo no usa el carrito y entra a
// cada tienda con documento completo, que reinicia el carrito en memoria.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bike, Clock, ShoppingBag } from 'lucide-react';
import { etaWindow, formatPrice } from '@/lib/marketplace';
import type { StoreInfo } from '@/lib/store-data';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#9a3412]';

function Chip({ icon, children, tone = 'plain' }: { icon: ReactNode; children: ReactNode; tone?: 'plain' | 'fresh' }) {
  return (
    <li className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 tabular-nums ${
      tone === 'fresh' ? 'bg-[#dcfce7] font-bold text-[#15803d]' : 'bg-[#f1ede8] text-[#1c1917]'}`}>
      {icon}
      {children}
    </li>
  );
}

export default function MarketplaceStoreBar({ store }: { store: StoreInfo }) {
  const currency = store.currency || 'MXN';
  const eta = etaWindow(typeof store.estimatedDelivery === 'number' && store.estimatedDelivery > 0 ? store.estimatedDelivery : null);
  const delivery = store.delivery;
  const chips: ReactNode[] = [];
  if (eta) chips.push(<Chip key="eta" icon={<Clock aria-hidden="true" className="h-4 w-4" />}>{eta}</Chip>);
  if (delivery?.mode === 'FLAT') {
    chips.push(delivery.flatFee === 0
      ? <Chip key="fee" tone="fresh" icon={<Bike aria-hidden="true" className="h-4 w-4" />}>Envío gratis</Chip>
      : <Chip key="fee" icon={<Bike aria-hidden="true" className="h-4 w-4" />}>Envío {formatPrice(delivery.flatFee, currency)}</Chip>);
    if (delivery.flatFee > 0 && delivery.freeFrom) {
      chips.push(<Chip key="free" tone="fresh" icon={<Bike aria-hidden="true" className="h-4 w-4" />}>Gratis desde {formatPrice(delivery.freeFrom, currency)}</Chip>);
    }
  } else if (delivery) {
    chips.push(<Chip key="fee" icon={<Bike aria-hidden="true" className="h-4 w-4" />}>Envío según distancia</Chip>);
  }
  if (store.minOrderAmount && store.minOrderAmount > 0) {
    chips.push(<Chip key="min" icon={<ShoppingBag aria-hidden="true" className="h-4 w-4" />}>Mínimo {formatPrice(store.minOrderAmount, currency)}</Chip>);
  }

  return (
    <nav aria-label="Marketplace" className="border-b border-[#e7e2dc] bg-white text-sm text-[#1c1917]">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
        <Link
          href="/"
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e7e2dc] px-3 py-1.5 font-bold hover:border-[#9a3412] hover:text-[#9a3412] ${FOCUS}`}
        >
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
          Volver al catálogo
        </Link>
        {chips.length > 0 && (
          <ul aria-label={`Entrega de ${store.name}`} className="flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]">
            {chips}
          </ul>
        )}
      </div>
    </nav>
  );
}
