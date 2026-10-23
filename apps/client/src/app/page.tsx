import type { Metadata } from "next";
import { redirect } from "next/navigation";
import MarketplaceHomeV2 from "@/components/MarketplaceHomeV2";
import { getMarketplaceApiUrl, isMarketplaceCatalogEnabled, isMarketplaceIsolated, isMarketplacePreviewDemo } from "@/lib/config";
import { loadCatalog, parseCatalogParams } from "@/lib/marketplace";
import { loadPreviewCatalog } from "@/lib/marketplace-preview";

// Búsqueda y páginas salen de la URL en cada request; nada se prerenderiza.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: "Marketplace | MRTPVREST",
    description: "Busca tiendas y productos y pide directo en la tienda.",
    // La copia aislada nunca debe indexarse.
    robots: isMarketplaceIsolated() || isMarketplacePreviewDemo() ? { index: false, follow: false } : undefined,
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
  // En Preview no usamos credenciales, API ni pedidos reales. Al conectar un
  // staging separado se desactivará esta demostración explícitamente.
  const previewDemo = isMarketplacePreviewDemo();
  const { stores, products } = previewDemo
    ? loadPreviewCatalog(state, queryTooLong)
    : await loadCatalog(getMarketplaceApiUrl(), state, queryTooLong);

  return (
    <MarketplaceHomeV2
      state={state}
      stores={stores}
      products={products}
      isolated={isMarketplaceIsolated()}
      previewDemo={previewDemo}
    />
  );
}
