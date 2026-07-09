export type Location = {
  id: string;
  name: string;
  autoPromoEnabled: boolean;
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
};

export type ConfigDraft = {
  autoPromoThreshold: number;
  autoPromoDiscount: number;
  autoPromoMaxItems: number;
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

export const discountPct = (price: number, promo: number) =>
  Math.round(((price - promo) / price) * 100);
