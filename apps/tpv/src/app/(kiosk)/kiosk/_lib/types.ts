export type Modifier = { id: string; name: string; price: number };

export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  modifiers: Modifier[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  modifierGroups: ModifierGroup[];
};

export type Category = { id: string; name: string; items: MenuItem[] };

export type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  modifiers: { modifierId: string; name: string; price: number }[];
};

export type Screen = "menu" | "cart" | "payment" | "success" | "error" | "forbidden" | "no-provider";
