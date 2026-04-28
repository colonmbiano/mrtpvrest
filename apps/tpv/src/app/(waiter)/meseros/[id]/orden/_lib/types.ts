export type Product = {
  id: string;
  name: string;
  price: number;
  categoryId?: string;
  imageUrl?: string | null;
  promoPrice?: number | null;
};

export type CartLine = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};
