import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { MapPin, Phone, MessageCircle } from 'lucide-react';
import { MochiTheme } from '@/components/themes/MochiTheme';
import { MundialistaTheme } from '@/components/themes/MundialistaTheme';
import { getApiUrl } from '@/lib/config';
import { cldImage } from '@/lib/cloudinary';
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
  whatsappOrder?: { enabled: boolean; number: string | null };
  isOpen?: boolean;
  closedMessage?: string | null;
  minOrderAmount?: number;
  estimatedDelivery?: number;
  onlinePayment?: boolean;
  delivery?: DeliveryConfig;
  // El backend (GET /api/store/info) devuelve estos campos planos:
  storefrontTheme?: string | null;
  primaryColor?: string | null;
  heroImageUrl?: string | null;
  // Retrocompat: algunas respuestas antiguas anidaban el tema aquí.
  themeConfig?: {
    theme?: string;
    primaryColor?: string;
  } | null;
};

// Temas activos: KAWAII (pastel bubble-tea, alias MOCHI) y MUNDIALISTA. Cualquier
// otro valor (incluidos los temas retirados HALO/BRUTALIST/ANTOJO) cae a DEFAULT,
// que renderiza el cliente legacy como red de seguridad.
function normalizeTheme(raw?: string | null): 'MOCHI' | 'MUNDIALISTA' | 'DEFAULT' {
  const map: Record<string, 'MOCHI' | 'MUNDIALISTA' | 'DEFAULT'> = {
    MOCHI: 'MOCHI', KAWAII: 'MOCHI',
    MUNDIALISTA: 'MUNDIALISTA', MUNDIAL: 'MUNDIALISTA',
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

// Metadata dinámico por tenant: title/description/OG/favicon/canonical. Clave
// para el preview de WhatsApp (necesita imagen y URL absolutas). fetchStore se
// memoiza por request, así que reusar la misma llamada del render no recobra.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  const name = store?.name ?? 'Tienda';
  const base = `https://${slug}.mrtpvrest.com`;
  const description = `Haz tu pedido en línea en ${name}. Rápido y fácil, directo a tu domicilio.`;
  // store.logo ya es URL absoluta de Cloudinary. WhatsApp no resuelve relativas.
  const logo = store?.logo || undefined;
  // Favicon pequeño y imagen OG recortada a 1.91:1 (en vez del logo cuadrado
  // declarado como 1200x630), ambas optimizadas vía Cloudinary.
  const iconUrl = cldImage(logo, { width: 96 });
  const ogImage = cldImage(logo, { width: 800, ar: '1200:630', crop: 'fill' });
  const ogImages = ogImage ? [{ url: ogImage, width: 800, height: 420, alt: name }] : undefined;

  return {
    metadataBase: new URL(base),
    title: `${name} | Pedidos en línea`,
    description,
    applicationName: name,
    icons: iconUrl ? { icon: iconUrl } : undefined,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'es_MX',
      url: base,
      siteName: name,
      title: `${name} | Pedidos en línea`,
      description,
      images: ogImages,
    },
    twitter: {
      card: 'summary_large_image',
      title: name,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

// Viewport por tenant: themeColor con el color de marca y zoom habilitado.
export async function generateViewport({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Viewport> {
  const { slug } = await params;
  const store = await fetchStore(slug);
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: store?.primaryColor || '#ff5c35',
  };
}

export default async function StorefrontPage({
  params,
  searchParams,
}: {
  // Next.js 15+/16: params es asíncrono y DEBE await-earse. Acceder a
  // params.slug de forma síncrona devuelve undefined -> fetchStore(undefined)
  // -> 404 para CUALQUIER slug. Este era el bug que tiraba 404 en toda tienda.
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ theme?: string }>;
}) {
  const { slug } = await params;
  // Vista previa de tema: ?theme=MUNDIALISTA permite al dueño ver cualquier
  // skin ANTES de activarlo en /admin/tienda. Solo afecta el render (lectura),
  // no cambia nada en la BD ni el pedido.
  const { theme: themeOverride } = await searchParams;

  const [store, menu, locations] = await Promise.all([
    fetchStore(slug),
    fetchMenu(slug),
    fetchLocations(slug),
  ]);

  if (!store || !store.hasWebStore) notFound();

  const primary = store.primaryColor || store.themeConfig?.primaryColor || '#ff5c35';
  const theme = normalizeTheme(themeOverride || store.storefrontTheme || store.themeConfig?.theme);

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
            <img src={cldImage(store.logo, { width: 200 })} alt={store.name} loading="lazy" decoding="async" className="w-20 h-20 object-contain mx-auto mb-6 rounded-3xl" />
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
    whatsappOrder: store.whatsappOrder,
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
      {theme === 'MUNDIALISTA' && <MundialistaTheme data={data} />}

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
