export type DayOfWeek = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';

export type Location = {
  id: string;
  name: string;
  autoPromoEnabled: boolean;
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
  activeDays?: DayOfWeek[];
};

export type ConfigDraft = {
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
  activeDays: DayOfWeek[];
};

export type PromoSettings = {
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
  activeDays: DayOfWeek[];
};

export type PromoItem = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  promoPrice: number | null;
  isPromo: boolean;
  soldLast7Days: number;
  category: { name: string };
  updatedAt: string;
};

export type DryRunResult = {
  recommendedItems: Array<{
    id: string;
    name: string;
    currentPrice: number;
    recommendedPrice: number;
    discount: number;
    soldLast7Days: number;
  }>;
  totalItemsApplicable: number;
  estimatedImpact: {
    itemsInPromo: number;
    averageDiscount: number;
  };
};

export const discountPct = (price: number, promo: number) =>
  Math.round(((price - promo) / price) * 100);

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY: 'Lunes',
  TUESDAY: 'Martes',
  WEDNESDAY: 'Miércoles',
  THURSDAY: 'Jueves',
  FRIDAY: 'Viernes',
  SATURDAY: 'Sábado',
  SUNDAY: 'Domingo',
};

export const ALL_DAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
