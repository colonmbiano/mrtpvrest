export type StoreProps = {
  id: string;
  name: string;
  logo: string | null;
  whatsappNumber: string | null;
  primaryColor: string;
  slug?: string;
  storefrontTheme?: string;
};

export type CartLine = { id: string; name: string; quantity: number; price: number };

export interface ThemeProps {
  store: StoreProps;
  categories: any[];
  lines: CartLine[];
  add: (i: { id: string; name: string; price: number }) => void;
  remove: (id: string) => void;
  total: number;
  quantity: number;
  primary: string;
  activeCat: string;
  scrollTo: (id: string) => void;
  catRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  onCheckout: () => void;
  fmt: (n: number) => string;
}
