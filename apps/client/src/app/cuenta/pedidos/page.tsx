import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import MyOrders from '@/components/account/MyOrders';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mis pedidos | MRTPVREST Marketplace',
  robots: { index: false, follow: false },
};

export default function MyOrdersPage() {
  if (!isMarketplaceCatalogEnabled() || !isMarketplaceAccountsEnabled()) redirect('/');
  return <MyOrders />;
}
