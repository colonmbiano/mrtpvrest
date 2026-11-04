import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import VerifyEmail from '@/components/account/VerifyEmail';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

export const dynamic = 'force-dynamic';

// Destino del enlace del correo de verificación (#token=… en el fragmento).
export const metadata: Metadata = {
  title: 'Verificar correo | MRTPVREST Marketplace',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function VerifyEmailPage() {
  if (!isMarketplaceCatalogEnabled() || !isMarketplaceAccountsEnabled()) redirect('/');
  return <VerifyEmail />;
}
