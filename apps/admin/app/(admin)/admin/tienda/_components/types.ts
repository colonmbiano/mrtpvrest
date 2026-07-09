import { Flower2, Trophy, type LucideIcon } from "lucide-react";

export type BusinessHour = { day: number; enabled: boolean; open: string; close: string };

// 0=Domingo … 6=Sábado (coincide con Date.getDay() y el backend).
export const WEEK_DAYS = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

export const TIMEZONES = [
  { value: "America/Mexico_City", label: "Ciudad de México (Centro)" },
  { value: "America/Cancun", label: "Cancún / Quintana Roo (Este)" },
  { value: "America/Monterrey", label: "Monterrey" },
  { value: "America/Chihuahua", label: "Chihuahua (Pacífico)" },
  { value: "America/Hermosillo", label: "Hermosillo (Sonora)" },
  { value: "America/Tijuana", label: "Tijuana (Noroeste)" },
  { value: "America/Bogota", label: "Bogotá / Lima" },
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/Santiago", label: "Santiago" },
  { value: "America/New_York", label: "Nueva York (Este EE.UU.)" },
  { value: "Europe/Madrid", label: "Madrid" },
];

// País del restaurante (ISO 3166-1 alpha-2). Determina la lada que se antepone a
// los teléfonos en los enlaces/notificaciones de WhatsApp. Debe mantenerse en
// sintonía con el mapeo de packages/config/phone.js.
export const COUNTRIES = [
  { code: "MX", name: "México (+52)" },
  { code: "US", name: "Estados Unidos (+1)" },
  { code: "CO", name: "Colombia (+57)" },
  { code: "AR", name: "Argentina (+54)" },
  { code: "CL", name: "Chile (+56)" },
  { code: "PE", name: "Perú (+51)" },
  { code: "EC", name: "Ecuador (+593)" },
  { code: "GT", name: "Guatemala (+502)" },
  { code: "SV", name: "El Salvador (+503)" },
  { code: "HN", name: "Honduras (+504)" },
  { code: "CR", name: "Costa Rica (+506)" },
  { code: "PA", name: "Panamá (+507)" },
  { code: "DO", name: "República Dominicana (+1)" },
  { code: "BO", name: "Bolivia (+591)" },
  { code: "PY", name: "Paraguay (+595)" },
  { code: "UY", name: "Uruguay (+598)" },
  { code: "VE", name: "Venezuela (+58)" },
  { code: "BR", name: "Brasil (+55)" },
  { code: "CA", name: "Canadá (+1)" },
  { code: "ES", name: "España (+34)" },
];

export const DEFAULT_HOUR: Omit<BusinessHour, "day"> = { enabled: false, open: "09:00", close: "22:00" };

export const THEMES: { id: string; name: string; icon: LucideIcon; desc: string }[] = [
  { id: "KAWAII", name: "Kawaii", icon: Flower2, desc: "Pastel lavanda · bubble-tea · cute 🧋" },
  { id: "MUNDIALISTA", name: "Mundialista", icon: Trophy, desc: "Estadio oscuro · Dorado · Mundial ⚽" },
];

export const DELIVERY_MODES: { id: "FLAT" | "DISTANCE"; name: string; desc: string }[] = [
  { id: "FLAT", name: "Tarifa fija", desc: "Un costo único para todos" },
  { id: "DISTANCE", name: "Por distancia", desc: "Base + costo por km" },
];

// Forma completa del estado de configuración de la tienda.
export type TiendaConfig = {
  slug: string;
  phone: string;
  address: string;
  whatsappNumber: string;
  countryCode: string;
  deliveryFee: number;
  minOrderAmount: number;
  freeDeliveryFrom: number;
  estimatedDelivery: number;
  storefrontTheme: string;
  storefrontHeroUrl: string;
  // Módulo OlaClick: pedir por WhatsApp desde el menú digital (gateado por plan).
  whatsappOrderingEnabled: boolean;
  hasWhatsappOrdersModule: boolean;
  // Aviso al dueño por WhatsApp cuando entra un pedido web.
  orderAlertEnabled: boolean;
  orderAlertWhatsapp: string;
  isOpen: boolean;
  closedMessage: string;
  maxOpenOrders: number;
  saturatedMessage: string;
  adminCanViewExpectedCash: boolean;
  cashCutEmailEnabled: boolean;
  cashCutEmails: string;
  scheduleEnabled: boolean;
  timezone: string;
  businessHours: BusinessHour[];
  deliveryMode: "FLAT" | "DISTANCE";
  originLat: number | null;
  originLng: number | null;
  deliveryBaseFee: number;
  deliveryPerKm: number;
  deliveryFreeRadiusKm: number | null;
  deliveryMaxKm: number | null;
  pointsPerTen: number;
  pointsValuePesos: number;
};

// ── Recompensas por puntos (lealtad Fase 3) ─────────────────────────────────
// CRUD contra /api/loyalty/rewards. Una recompensa da un producto gratis o un
// descuento fijo en $; el cliente la canjea en el checkout de la tienda online.
export type Reward = {
  id: string;
  name: string;
  description?: string | null;
  pointsCost: number;
  menuItemId?: string | null;
  menuItem?: { id: string; name: string } | null;
  discountAmount?: string | number | null;
  isActive: boolean;
};

// ── Cupones de descuento (código) ───────────────────────────────────────────
// CRUD contra /api/loyalty/coupons. El cliente escribe el código en el checkout
// de la tienda online y obtiene el descuento. Es exclusivo de la tienda: el bot
// de WhatsApp no canjea cupones, así que un cupón aquí empuja a pedir por la web.
export type Coupon = {
  id: string;
  code: string;
  description: string;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: string | number;
  minOrderAmount: string | number;
  maxUses?: number | null;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
};
