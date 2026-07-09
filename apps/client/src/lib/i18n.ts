// i18n de la tienda pública — solo la interfaz (botones y textos fijos). Los
// nombres/descripciones de platillos NO se traducen (los escribe el negocio).
// Español es la base; si falta una clave en otro idioma, cae al español.

export type Lang = "es" | "en";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "es", label: "ES", flag: "🇲🇽" },
  { code: "en", label: "EN", flag: "🇺🇸" },
];

type Dict = Record<string, string>;

const ES: Dict = {
  delivery: "Entrega",
  pickup: "Recoger",
  search: "Buscar platillos…",
  cart: "Carrito",
  my_order: "Mi pedido",
  empty_cart: "Tu carrito está vacío",
  add: "Agregar",
  add_to_cart: "Agregar al carrito",
  subtotal: "Subtotal",
  total: "Total",
  delivery_fee: "Envío",
  free: "Gratis",
  min_order: "Pedido mínimo",
  no_min: "sin mínimo",
  send_whatsapp: "Enviar por WhatsApp",
  checkout: "Ir a pagar",
  pay: "Pagar",
  confirm: "Confirmar",
  keep_browsing: "Seguir viendo el menú",
  from: "Desde",
  popular: "Popular",
  promo: "Promo",
  new: "Nuevo",
  closed: "Cerrado por ahora",
  order_now: "Ordenar ahora",
  view_menu: "Ver menú",
};

const EN: Dict = {
  delivery: "Delivery",
  pickup: "Pickup",
  search: "Search dishes…",
  cart: "Cart",
  my_order: "My order",
  empty_cart: "Your cart is empty",
  add: "Add",
  add_to_cart: "Add to cart",
  subtotal: "Subtotal",
  total: "Total",
  delivery_fee: "Delivery",
  free: "Free",
  min_order: "Minimum order",
  no_min: "no minimum",
  send_whatsapp: "Send via WhatsApp",
  checkout: "Checkout",
  pay: "Pay",
  confirm: "Confirm",
  keep_browsing: "Keep browsing the menu",
  from: "From",
  popular: "Popular",
  promo: "Deal",
  new: "New",
  closed: "Closed right now",
  order_now: "Order now",
  view_menu: "View menu",
};

const DICT: Record<Lang, Dict> = { es: ES, en: EN };

export function translate(lang: Lang, key: string): string {
  return DICT[lang]?.[key] ?? ES[key] ?? key;
}
