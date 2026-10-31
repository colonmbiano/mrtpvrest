export type WeightUnit = 'kg' | 'g' | 'pesos';
export type WeightProduct = {
  soldByWeight?: boolean;
  saleUnit?: string;
  minWeightKg?: number | string | null;
};

export function isSoldByWeight(product: WeightProduct | null | undefined): boolean;
export function hasMinimumWeight(product: WeightProduct | null | undefined): boolean;
export function minimumWeight(product: WeightProduct | null | undefined): number;
export function defaultSaleWeight(product: WeightProduct | null | undefined): number;
export function parseWeightInput(
  value: string | number,
  unit: WeightUnit,
  pricePerKg: number,
  minKg?: number,
): number | null;
export function resolveSaleWeight(
  product: WeightProduct & { price?: number; name?: string },
  value: unknown,
  quantity?: number,
): number | null;
export function normalizeMinimumWeight(value: unknown): number | null;
export function weightDisplayName(name: string, kg: number): string;
