import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import MesaMenu from '@/components/mesa/MesaMenu';
import { cldImage } from '@/lib/cloudinary';
import {
  fetchStore, fetchMenu, fetchLocations, tableNumberFromToken,
} from '@/lib/store-data';

/**
 * Menú de mesa: `/[slug]/mesa?t=<token firmado>&l=<sucursal>`.
 *
 * Es la ruta a la que apuntan los QR pegados en cada mesa. No comparte shell con
 * el storefront normal a propósito: aquel tiene forma de domicilio (tipo de
 * pedido, envío, mínimo, «enviar por WhatsApp» en cada tema) y el modo mesa
 * quedaba como una excepción repetida en cada superficie. Aquí sobra nada.
 *
 * El storefront normal sigue aceptando `?t=` y `?mesa=`, así que ningún enlace
 * viejo se rompe.
 */

export const metadata: Metadata = {
  title: 'Pedir desde mi mesa',
  // El QR es de uso interno del local: no tiene por qué salir en buscadores.
  robots: { index: false, follow: false },
};

export default async function MesaPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ t?: string; l?: string; mesa?: string }>;
}) {
  const { slug } = await params;
  const { t, l, mesa } = await searchParams;

  const token = typeof t === 'string' ? t.trim() : '';
  // `?mesa=` solo como etiqueta de respaldo para los QR del esquema viejo; lo
  // que ata el pedido a la mesa es el token firmado.
  const tableLabel = token ? tableNumberFromToken(token) : (mesa ? String(mesa).trim() : null);
  const locationId = typeof l === 'string' && l ? l : null;

  const [store, menu, locations] = await Promise.all([
    fetchStore(slug),
    fetchMenu(slug),
    fetchLocations(slug),
  ]);

  if (!store || !store.hasWebStore) notFound();

  const accent = store.primaryColor || store.themeConfig?.primaryColor || '#ff5c35';

  // Sin token ni número: alguien llegó a /mesa a mano. Se explica en vez de
  // dejarlo en un menú que no podría enviar el pedido a ninguna mesa.
  if (!token && !tableLabel) {
    return (
      <Aviso
        accent={accent}
        title="Escanea el QR de tu mesa"
        text="Este menú es para pedir desde tu mesa. Busca el código pegado en la mesa y escanéalo con la cámara."
        logo={store.logo}
        storeName={store.name}
      />
    );
  }

  if (store.isOpen === false) {
    return (
      <Aviso
        accent={accent}
        title="Cocina cerrada"
        text={store.closedMessage || 'En este momento no estamos tomando pedidos. Pregunta al personal del local.'}
        logo={store.logo}
        storeName={store.name}
      />
    );
  }

  return (
    <MesaMenu
      slug={slug}
      storeName={store.name}
      logo={store.logo}
      accent={accent}
      currency={store.currency}
      currencyLocale={store.currencyLocale}
      categories={menu?.categories || []}
      locations={locations || []}
      tableLabel={tableLabel}
      tableToken={token}
      locationId={locationId}
    />
  );
}

function Aviso({
  accent, title, text, logo, storeName,
}: { accent: string; title: string; text: string; logo: string | null; storeName: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm text-center">
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cldImage(logo, { width: 160 }) || ''} alt={storeName} className="mx-auto mb-5 h-16 w-16 rounded-2xl object-contain" />
        )}
        <span
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: `${accent}1f`, color: accent }}
        >
          <UtensilsCrossed className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-black text-gray-900">{title}</h1>
        <p className="mt-2 text-sm font-bold leading-relaxed text-gray-500">{text}</p>
      </div>
    </div>
  );
}
