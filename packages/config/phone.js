// packages/config/phone.js
// Utilidad compartida (CommonJS) para normalizar teléfonos hacia el formato que
// exige WhatsApp: solo dígitos, con código de país (lada) y SIN el "+".
//
// Es consumida tanto por el backend (require) como por las apps Next que la
// transpilan (@mrtpvrest/config está en transpilePackages). Por eso se escribe
// en CommonJS puro, sin dependencias.
//
// Fuente de verdad del país: RestaurantConfig.countryCode (ISO 3166-1 alpha-2).
// Si no se pasa país, cae al DEFAULT_COUNTRY.

const DEFAULT_COUNTRY = 'MX';

// ISO alpha-2 → lada telefónica (sin "+"). Foco en LATAM + mercados comunes.
// Ampliar aquí cuando se sume un país nuevo; es el único lugar a tocar.
const COUNTRY_DIAL_CODES = {
  MX: '52',  // México
  US: '1',   // Estados Unidos
  CA: '1',   // Canadá
  CO: '57',  // Colombia
  AR: '54',  // Argentina
  CL: '56',  // Chile
  PE: '51',  // Perú
  EC: '593', // Ecuador
  GT: '502', // Guatemala
  SV: '503', // El Salvador
  HN: '504', // Honduras
  NI: '505', // Nicaragua
  CR: '506', // Costa Rica
  PA: '507', // Panamá
  DO: '1',   // República Dominicana (NANP)
  BO: '591', // Bolivia
  PY: '595', // Paraguay
  UY: '598', // Uruguay
  VE: '58',  // Venezuela
  BR: '55',  // Brasil
  ES: '34',  // España
};

// Lista lista para poblar un <select> en las UIs de configuración.
// Nombre en español + lada visible. (Sin emoji: respeta el design system.)
const COUNTRIES = [
  { code: 'MX', name: 'México', dial: '52' },
  { code: 'US', name: 'Estados Unidos', dial: '1' },
  { code: 'CO', name: 'Colombia', dial: '57' },
  { code: 'AR', name: 'Argentina', dial: '54' },
  { code: 'CL', name: 'Chile', dial: '56' },
  { code: 'PE', name: 'Perú', dial: '51' },
  { code: 'EC', name: 'Ecuador', dial: '593' },
  { code: 'GT', name: 'Guatemala', dial: '502' },
  { code: 'SV', name: 'El Salvador', dial: '503' },
  { code: 'HN', name: 'Honduras', dial: '504' },
  { code: 'CR', name: 'Costa Rica', dial: '506' },
  { code: 'PA', name: 'Panamá', dial: '507' },
  { code: 'DO', name: 'República Dominicana', dial: '1' },
  { code: 'BO', name: 'Bolivia', dial: '591' },
  { code: 'PY', name: 'Paraguay', dial: '595' },
  { code: 'UY', name: 'Uruguay', dial: '598' },
  { code: 'VE', name: 'Venezuela', dial: '58' },
  { code: 'BR', name: 'Brasil', dial: '55' },
  { code: 'CA', name: 'Canadá', dial: '1' },
  { code: 'ES', name: 'España', dial: '34' },
];

/** Lada del país (sin "+"). Cae al país por defecto si el código no se reconoce. */
function dialCodeFor(countryCode) {
  const cc = String(countryCode || DEFAULT_COUNTRY).toUpperCase();
  return COUNTRY_DIAL_CODES[cc] || COUNTRY_DIAL_CODES[DEFAULT_COUNTRY];
}

/**
 * Convierte un teléfono crudo al formato que espera WhatsApp (solo dígitos con
 * lada, sin "+").
 *
 * Reglas (pensadas para los datos reales: el cliente se guarda casi siempre
 * como número nacional sin lada):
 *  - Quita todo lo que no sea dígito (espacios, guiones, paréntesis, "+").
 *  - Quita ceros de tronco al inicio (prefijo nacional en varios países).
 *  - Si quedan ≤ 10 dígitos → es número nacional → antepone la lada del país.
 *  - Si ya empieza con la lada → se respeta tal cual (ya viene internacional).
 *  - Cualquier otro caso → antepone la lada (mejor sobre-calificar que fallar).
 *
 * Nota: no es un parser E.164 completo (eso requeriría libphonenumber). Cubre
 * de forma robusta el caso común; ampliar si se necesita precisión por país.
 *
 * @returns {string} dígitos listos para `https://wa.me/<retorno>`, o '' si no hay número.
 */
function toWhatsappNumber(raw, countryCode) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';

  digits = digits.replace(/^0+/, '');
  if (!digits) return '';

  const dial = dialCodeFor(countryCode);

  if (digits.length <= 10) return dial + digits;       // número nacional
  if (digits.startsWith(dial)) return digits;           // ya trae lada
  return dial + digits;                                 // fallback
}

/** URL completa de WhatsApp (opcionalmente con texto pre-rellenado); '' si no hay número. */
function whatsappUrl(raw, text, countryCode) {
  const num = toWhatsappNumber(raw, countryCode);
  if (!num) return '';
  const base = `https://wa.me/${num}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

module.exports = {
  DEFAULT_COUNTRY,
  COUNTRY_DIAL_CODES,
  COUNTRIES,
  dialCodeFor,
  toWhatsappNumber,
  whatsappUrl,
};
