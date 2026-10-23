import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MarketplaceCatalog from "@/components/MarketplaceCatalog";
import { getMarketplaceApiUrl, isMarketplaceCatalogEnabled, isMarketplaceIsolated } from "@/lib/config";
import { loadCatalog, parseCatalogParams } from "@/lib/marketplace";

// Búsqueda y páginas salen de la URL en cada request; nada se prerenderiza.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Marketplace | MRTPVREST",
    description: "Busca tiendas y productos y pide directo en la tienda.",
    // La copia aislada nunca debe indexarse.
    robots: isMarketplaceIsolated() ? { index: false, follow: false } : undefined,
  };
}

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isMarketplaceCatalogEnabled()) {
    // Sin catálogo habilitado se conserva el comportamiento productivo:
    // quien entra a client.mrtpvrest.com directamente va al dominio principal.
    redirect("https://mrtpvrest.com");
  }

  const { state, queryTooLong } = parseCatalogParams(await searchParams);
  // Tiendas desde la API v1 solo con la bandera activa; por defecto, la API legacy.
  const storesSource = process.env.NEXT_PUBLIC_MARKETPLACE_STORES_V1 === 'true' ? 'v1' : 'legacy';
  const { stores, products } = await loadCatalog(getMarketplaceApiUrl(), state, queryTooLong, { storesSource });

  return (
    <MarketplaceCatalog
      state={state}
      stores={stores}
      products={products}
      isolated={isMarketplaceIsolated()}
    />
  );
}
