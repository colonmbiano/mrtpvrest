import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { marketplaceAppMetadata } from '@/lib/marketplaceApp';

// Mi cuenta es parte de la app instalable del marketplace.
export const metadata = marketplaceAppMetadata;

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ServiceWorkerRegister /></>;
}
