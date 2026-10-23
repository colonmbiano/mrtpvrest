import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MarketplaceRegistration from '@/components/MarketplaceRegistration';
import { isMarketplaceCatalogEnabled, isMarketplaceIsolated, isMarketplacePreviewDemo } from '@/lib/config';
import { parseRegistrationRole } from '@/lib/marketplace-registration';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: 'Registro | MRTPVREST Marketplace',
    description: 'Elige tu perfil de negocio, cliente o repartidor en MRTPVREST Marketplace.',
    // Nunca indexar una maqueta de registro sin servicio de identidad activo.
    robots: { index: false, follow: false },
  };
}

export default async function RegistrationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // En producción legacy la nueva ruta no debe ser accesible si el marketplace
  // está apagado. No generar un formulario en los subdominios de otras tiendas.
  if (!isMarketplaceCatalogEnabled()) redirect('/');
  const { tipo } = await searchParams;
  return <MarketplaceRegistration selectedRole={parseRegistrationRole(tipo)} />;
}
