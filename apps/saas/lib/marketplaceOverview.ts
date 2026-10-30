export const MARKETPLACE_OVERVIEW_URL = '/api/saas/marketplace/overview';

export type MarketplaceMerchant = {
  id: string; name: string; businessType: string; isActive: boolean;
  orderCount: number; gmv: number; createdAt: string;
};
export type MarketplaceTransaction = {
  id: string; orderId: string; restaurantId: string; eventType: string;
  amount: number; createdAt: string;
};
export type MarketplaceOverview = {
  currency: 'MXN'; gmvTotal: number; platformFees: number; totalOrders: number; activeMerchants: number;
  balances: { GATEWAY_ESCROW: number; MERCHANT_PAYABLE: number; COURIER_PAYABLE: number };
  merchants: MarketplaceMerchant[]; recentTransactions: MarketplaceTransaction[];
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const date = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));

// El servidor calcula GMV y comisiones desde las órdenes pagadas y el libro contable.
// La UI no impone un porcentaje ni vuelve a sumar transacciones de tipos distintos.
export function parseMarketplaceOverview(value: unknown): MarketplaceOverview {
  if (!record(value) || value.currency !== 'MXN' || !amount(value.gmvTotal) || !amount(value.platformFees)
    || !Number.isSafeInteger(value.totalOrders) || Number(value.totalOrders) < 0
    || !Number.isSafeInteger(value.activeMerchants) || Number(value.activeMerchants) < 0
    || !record(value.balances) || !['GATEWAY_ESCROW', 'MERCHANT_PAYABLE', 'COURIER_PAYABLE'].every(key => amount(value.balances && (value.balances as Record<string, unknown>)[key]))
    || !Array.isArray(value.merchants) || !value.merchants.every(row => record(row)
      && text(row.id) && text(row.name) && text(row.businessType) && typeof row.isActive === 'boolean'
      && Number.isSafeInteger(row.orderCount) && Number(row.orderCount) >= 0 && amount(row.gmv) && date(row.createdAt))
    || !Array.isArray(value.recentTransactions) || !value.recentTransactions.every(row => record(row)
      && text(row.id) && text(row.orderId) && text(row.restaurantId) && text(row.eventType) && amount(row.amount) && date(row.createdAt))) {
    throw new Error('La auditoría del marketplace devolvió datos incompletos.');
  }
  return value as MarketplaceOverview;
}

export async function loadMarketplaceOverview(client: { get: (url: string) => Promise<{ data: unknown }> }): Promise<MarketplaceOverview> {
  const response = await client.get(MARKETPLACE_OVERVIEW_URL);
  return parseMarketplaceOverview(response.data);
}
