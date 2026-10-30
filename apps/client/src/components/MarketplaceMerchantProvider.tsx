'use client';

// Comercio del marketplace de la tienda actual. La página lo resuelve en el servidor (solo con la
// bandera activa); el checkout lo lee sin que cada tema tenga que reenviarlo como prop.
import { createContext, useContext, type ReactNode } from 'react';
import type { MarketplaceMerchantRef } from '../lib/marketplace';

const MarketplaceMerchantContext = createContext<MarketplaceMerchantRef | null>(null);

export function MarketplaceMerchantProvider({ value, children }: { value: MarketplaceMerchantRef | null; children: ReactNode }) {
  return <MarketplaceMerchantContext.Provider value={value}>{children}</MarketplaceMerchantContext.Provider>;
}

export function useMarketplaceMerchant(): MarketplaceMerchantRef | null {
  return useContext(MarketplaceMerchantContext);
}
