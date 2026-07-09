export type DeliveryConfig = {
  mode: 'FLAT' | 'DISTANCE';
  flatFee: number;
  freeFrom: number | null;
  baseFee: number;
  perKm: number;
  freeRadiusKm: number | null;
  maxKm: number | null;
  origin: { lat: number; lng: number } | null;
};

export type StoreProps = {
  id: string;
  name: string;
  logo: string | null;
  whatsappNumber: string | null;
  primaryColor: string;
  slug?: string;
  storefrontTheme?: string;
  minOrderAmount?: number;
  delivery?: DeliveryConfig;
  currency?: string | null;
  currencyLocale?: string | null;
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
