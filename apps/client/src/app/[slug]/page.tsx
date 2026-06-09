import { notFound } from 'next/navigation';
import { MapPin, Phone, MessageCircle } from 'lucide-react';
import { MochiTheme } from '@/components/themes/MochiTheme';
import { BentoTheme } from '@/components/themes/BentoTheme';
import { PocketTheme } from '@/components/themes/PocketTheme';
import { WagbaTheme } from '@/components/themes/WagbaTheme';
import { getApiUrl } from '@/lib/config';
import StorefrontClient from './StorefrontClient';
import InstallPWABanner from '@/components/InstallPWABanner';

const API = getApiUrl();

// Sucursal pública (subconjunto de lo que devuelve GET /api/store/locations).
type StoreLocation = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
};

// Normaliza un número a dígitos para construir el link de wa.me.
function waLink(number?: string | null): string | null {
  if (!number) return null;
  const digits = number.replace(/\D/g, '');
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

type DeliveryConfig = {
  mode: 'FLAT' | 'DISTANCE';
  flatFee: number;
  freeFrom: number | null;
  baseFee: number;
  perKm: number;
  freeRadiusKm: number | null;
  maxKm: number | null;
  origin: { lat: number; lng: number } | null;
};

type StoreInfo = {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  hasWebStore: boolean;
  whatsappNumber: string | null;
  isOpen?: boolean;
  closedMessage?: string | null;
  minOrderAmount?: number;
  estimatedDelivery?: number;
  onlinePayment?: boolean;
  delivery?: DeliveryConfig;
  // El backend (GET /api/store/info) devuelve estos campos planos:
  storefrontTheme?: string | null;
  primaryColor?: string | null;
  // Retrocompat: algunas respuestas antiguas anidaban el tema aquí.
  themeConfig?: {
    theme?: string;
    primaryColor?: string;
  } | null;
};

// El backend mapea el enum de la DB a alias (MOCHI→KAWAII, BENTO→HALO,
// POCKET→BRUTALIST). Aquí normalizamos cualquier variante al nombre canónico
// que usa el render de abajo. Sin esto el tema nunca coincide y cae a DEFAULT.
function normalizeTheme(raw?: string | null): 'MOCHI' | 'BENTO' | 'POCKET' | 'WAGBA' | 'DEFAULT' {
  const map: Record<string, 'MOCHI' | 'BENTO' | 'POCKET' | 'WAGBA' | 'DEFAULT'> = {
    MOCHI: 'MOCHI', KAWAII: 'MOCHI',
    BENTO: 'BENTO', HALO: 'BENTO',
    POCKET: 'POCKET', BRUTALIST: 'POCKET',
    WAGBA: 'WAGBA', ANTOJO: 'WAGBA',
    DEFAULT: 'DEFAULT',
  };
  return map[(raw || '').toUpperCase()] || 'DEFAULT';
}

async function fetchStore(slug: string): Promise<StoreInfo | null> {
  try {
    const res = await fetch(
      `${API}/api/store/info?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    return (await res.json()) as StoreInfo;
  } catch {
    return null;
  }
}

async function fetchMenu(slug: string) {
  try {
    const res = await fetch(
      `${API}/api/store/menu?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return { categories: [] };
    return await res.json();
  } catch {
    return { categories: [] };
  }
}

async function fetchLocations(slug: string) {
  try {
    const res = await fetch(
      `${API}/api/store/locations?r=${encodeURIComponent(slug)}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export default async function StorefrontPage({
  params,
}: {
  // Next.js 15+/16: params es asíncrono y DEBE await-earse. Acceder a
  // params.slug de forma síncrona devuelve undefined -> fetchStore(undefined)
  // -> 404 para CUALQUIER slug. Este era el bug que tiraba 404 en toda tienda.
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const [store, menu, locations] = await Promise.all([
    fetchStore(slug),
    fetchMenu(slug),
    fetchLocations(slug),
  ]);

  if (!store || !store.hasWebStore) notFound();

  const primary = store.primaryColor || store.themeConfig?.primaryColor || '#ff5c35';
  const theme = normalizeTheme(store.storefrontTheme || store.themeConfig?.theme);

  // Tienda cerrada: bloqueamos el catálogo para TODOS los temas y mostramos el
  // mensaje configurado. Así "activar/desactivar tienda" desde el admin tiene
  // efecto inmediato en el storefront sin depender del checkout de cada tema.
  if (store.isOpen === false) {
    const activeLocations = (locations as StoreLocation[]) || [];
    const wa = waLink(store.whatsappNumber);

    return (
      <div
        style={{ ['--color-primary' as string]: primary } as React.CSSProperties}
        className="min-h-screen bg-white flex items-center justify-center p-6"
      >
        <div className="max-w-sm w-full text-center bg-gray-50 rounded-[40px] p-10 shadow-xl">
          {store.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logo} alt={store.name} className="w-20 h-20 object-contain mx-auto mb-6 rounded-3xl" />
          )}
          <h1 className="text-2xl font-black mb-2">{store.name}</h1>
          <div className="inline-block text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full bg-gray-200 text-gray-600 mb-4">
            Tienda cerrada
          </div>
          <p className="text-gray-500 font-bold leading-relaxed">
            {store.closedMessage || 'En este momento no estamos recibiendo pedidos. ¡Vuelve pronto!'}
          </p>

          {/* Info de sucursal(es): nombre, dirección y teléfono. */}
          {activeLocations.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-200 space-y-4 text-left">
              {activeLocations.map((loc) => (
                <div key={loc.id} className="space-y-1.5">
                  {activeLocations.length > 1 && (
                    <p className="text-sm font-black text-gray-700">{loc.name}</p>
                  )}
                  {loc.address && (
                    <p className="flex items-start gap-2 text-sm font-bold text-gray-500 leading-snug">
                      <MapPin className="w-4 h-4 mt-0.5 shrink-0" style={{ color: primary }} />
                      <span>{loc.address}</span>
                    </p>
                  )}
                  {loc.phone && (
                    <a
                      href={`tel:${loc.phone.replace(/\s+/g, '')}`}
                      className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      <Phone className="w-4 h-4 shrink-0" style={{ color: primary }} />
                      <span>{loc.phone}</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Contacto por WhatsApp mientras la tienda está cerrada. */}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex items-center justify-center gap-2 w-full py-3.5 rounded-full bg-[#25D366] text-white font-black text-sm shadow-lg hover:brightness-105 active:scale-[0.98] transition"
            >
              <MessageCircle className="w-5 h-5" />
              Escríbenos por WhatsApp
            </a>
          )}
        </div>
      </div>
    );
  }

  // Los componentes de tema tipan info.themeConfig; lo sintetizamos a partir
  // de los campos planos para mantener compatibilidad de tipos y runtime.
  const info = { ...store, themeConfig: { theme, primaryColor: primary } };
  const data = { info, menu, locations };

  // Store base para el cliente legacy (temas Kawaii/Halo/Brutalist con checkout).
  const legacyStore = {
    id: store.id,
    name: store.name,
    logo: store.logo,
    whatsappNumber: store.whatsappNumber,
    primaryColor: primary,
    slug: store.slug,
    minOrderAmount: store.minOrderAmount,
    delivery: store.delivery,
  };

  return (
    <div
      style={{ ['--color-primary' as string]: primary } as React.CSSProperties}
      className="min-h-screen bg-white"
    >
      {theme === 'MOCHI' && <MochiTheme data={data} />}
      {theme === 'BENTO' && <BentoTheme data={data} />}
      {theme === 'POCKET' && <PocketTheme data={data} />}
      {theme === 'WAGBA' && <WagbaTheme data={data} />}

      {/* Fallback to legacy client if no modern theme is selected or during transition */}
      {theme === 'DEFAULT' && (
        <div style={{ ['--primary' as string]: primary } as React.CSSProperties}>
          <StorefrontClient
            store={legacyStore}
            categories={menu.categories || []}
          />
        </div>
      )}

      {/* PWA — banner flotante de instalación con branding del tenant */}
      <InstallPWABanner
        title={`Instala ${store.name}`}
        description="Tu menú a un toque, sin abrir el navegador."
        accentColor={primary}
      />
    </div>
  );
}
