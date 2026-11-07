import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AccountHome from '@/components/account/AccountHome';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mi cuenta | Mercadito Colorines',
  robots: { index: false, follow: false },
};

export default function AccountPage() {
  if (!isMarketplaceCatalogEnabled() || !isMarketplaceAccountsEnabled()) redirect('/');
  return <AccountHome />;
}
