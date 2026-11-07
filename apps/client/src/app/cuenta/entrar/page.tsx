import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import BuyerLogin, { type LoginMode } from '@/components/account/BuyerLogin';
import { isMarketplaceAccountsEnabled, isMarketplaceCatalogEnabled } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Entrar | Mercadito Colorines',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!isMarketplaceCatalogEnabled() || !isMarketplaceAccountsEnabled()) redirect('/');
  const params = await searchParams;
  const mode: LoginMode = params.olvide === '1' ? 'forgot' : params.reenviar === '1' ? 'resend' : 'login';
  return <BuyerLogin initialMode={mode} next={typeof params.next === 'string' ? params.next : undefined} />;
}
