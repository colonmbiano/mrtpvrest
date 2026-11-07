// El formulario real (BuyerSignup / CourierSignup) aparece cuando el build del
// cliente tiene NEXT_PUBLIC_MARKETPLACE_ACCOUNTS=true (y para enviarlo,
// NEXT_PUBLIC_TURNSTILE_SITE_KEY). Como son NEXT_PUBLIC_*, se hornean en build:
// al cambiarlas en Vercel hay que redesplegar con build fresco (sin reusar cache).
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MarketplaceRegistration from '@/components/MarketplaceRegistration';
import BuyerSignup from '@/components/account/BuyerSignup';
import CourierSignup from '@/components/account/CourierSignup';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';
import { parseRegistrationRole } from '@/lib/marketplace-registration';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: 'Registro | Mercadito Colorines',
    description: 'Elige tu perfil de negocio, cliente o repartidor en Mercadito Colorines.',
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
  const role = parseRegistrationRole(tipo);
  // Con las cuentas encendidas, cliente y repartidor se registran de verdad; el
  // negocio sigue siendo la demostración por ahora.
  if (isMarketplaceAccountsEnabled()) {
    if (role === 'cliente') return <BuyerSignup />;
    if (role === 'repartidor') return <CourierSignup />;
  }
  return <MarketplaceRegistration selectedRole={role} />;
}
