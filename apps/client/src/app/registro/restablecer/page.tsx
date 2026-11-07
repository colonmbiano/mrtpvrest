import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import ResetPassword from '@/components/account/ResetPassword';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Destino del enlace de recuperación de contraseña (#token=… en el fragmento).
export const metadata: Metadata = {
  title: 'Cambiar contraseña | Mercadito Colorines',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function ResetPasswordPage() {
  if (!isMarketplaceCatalogEnabled() || !isMarketplaceAccountsEnabled()) redirect('/');
  return <ResetPassword />;
}
