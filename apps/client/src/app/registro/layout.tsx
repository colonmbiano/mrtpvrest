import ServiceWorkerRegister from '@/components/ServiceWorkerRegister';
import { marketplaceAppMetadata } from '@/lib/marketplaceApp';

// El registro y los enlaces del correo abren dentro de la app del marketplace.
export const metadata = marketplaceAppMetadata;

export default function RegistrationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ServiceWorkerRegister /></>;
}
