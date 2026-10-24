/**
 * Catálogo de DEMOSTRACIÓN exclusivo de Vercel Preview en la rama Marketplace.
 * No usa API, BD, claves, pedidos ni enlaces de pago. Nunca habilitar en master.
 * Los importes son inventados para revisar únicamente el diseño responsive.
 */
import { PAGE_SIZE, type BusinessType, type CatalogState, type ProductSummary, type StoreSummary, type SectionResult } from './marketplace';

const base: Omit<StoreSummary, 'slug' | 'name' | 'businessType'> = {
  isOpen: true,
  closedMessage: null,
  estimatedDelivery: null,
  deliveryFee: null,
  freeDeliveryFrom: null,
  minOrderAmount: null,
};

const demoStores: StoreSummary[] = [
  // Negocios existentes que el usuario eligió destacar en la demostración.
  // Solo se muestra su identidad pública; NO cargamos inventario, precios,
  // horarios, productos ni pedidos de sus bases de datos reales.
  { ...base, slug: 'master-burguer-s', name: "Master Burguer’s", businessType: 'RESTAURANT' },
  { ...base, slug: 'tokki-bobba', name: 'Tokki Boba', businessType: 'RESTAURANT' },
  { ...base, slug: 'demo-hamburguesas', name: 'Hamburguesas Demo', businessType: 'RESTAURANT' },
  { ...base, slug: 'demo-super', name: 'Súper La Esquina · Demo', businessType: 'GROCERY' },
  { ...base, slug: 'demo-cafe', name: 'Cafecito Local · Demo', businessType: 'RESTAURANT' },
  { ...base, slug: 'demo-ferreteria', name: 'Ferretería Central · Demo', businessType: 'HARDWARE' },
  { ...base, slug: 'demo-retail', name: 'Tienda Urbana · Demo', businessType: 'RETAIL' },
  { ...base, slug: 'demo-refacciones', name: 'Refacciones Express · Demo', businessType: 'AUTOPARTS' },
];

function item(id: string, slug: string, name: string, categoryName: string, price: number, promoPrice: number | null, imageUrl?: string): ProductSummary {
  const store = demoStores.find(s => s.slug === slug);
  if (!store) throw new Error('Demo store missing');
  return {
    id, name, categoryName, price, promoPrice, likes: 0, currency: 'MXN',
    ...(imageUrl ? { imageUrl } : {}),
    store: { slug: store.slug, name: store.name },
  };
}
const demoProducts: ProductSummary[] = [
  item('d01', 'demo-hamburguesas', 'Hamburguesa especial', 'Hamburguesas', 129, 109, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=640&q=80'),
  item('d02', 'demo-super', 'Canasta de frutas', 'Frutas', 89, 75, 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=640&q=80'),
  item('d03', 'demo-cafe', 'Café artesanal', 'Bebidas', 59, 49, 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=640&q=80'),
  item('d04', 'demo-retail', 'Audífonos modernos', 'Accesorios', 399, 329, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=640&q=80'),
  item('d05', 'demo-ferreteria', 'Herramienta de trabajo', 'Herramientas', 699, null),
  item('d06', 'demo-refacciones', 'Accesorio para auto', 'Autopartes', 259, null),
  item('d07', 'demo-hamburguesas', 'Papas crujientes', 'Complementos', 69, null),
  item('d08', 'demo-super', 'Verduras frescas', 'Verduras', 95, 79, 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=640&q=80'),
  item('d09', 'demo-retail', 'Reloj de pulsera', 'Accesorios', 499, null, 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=640&q=80'),
  item('d10', 'demo-cafe', 'Postre de la casa', 'Postres', 78, null),
];

function paginate<T>(items: T[], page: number): SectionResult<T> {
  return {
    status: 'ok',
    data: { items: items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pageSize: PAGE_SIZE, total: items.length },
  };
}

export function loadPreviewCatalog(state: CatalogState, queryTooLong: boolean): {
  stores: SectionResult<StoreSummary>;
  products: SectionResult<ProductSummary>;
} {
  if (queryTooLong) {
    const error = { status: 'error', reason: 'invalid' } as const;
    return { stores: error, products: error };
  }

  const needle = state.q.trim().toLocaleLowerCase('es-MX');
  const stores = demoStores.filter(s =>
    (!state.type || s.businessType === state.type)
    && (!needle || s.name.toLocaleLowerCase('es-MX').includes(needle))
  );
  const products = demoProducts.filter(p =>
    (!state.store || p.store.slug === state.store)
    && (!needle || (p.name + ' ' + p.store.name).toLocaleLowerCase('es-MX').includes(needle))
  );
  return { stores: paginate(stores, state.storesPage), products: paginate(products, state.productsPage) };
}
