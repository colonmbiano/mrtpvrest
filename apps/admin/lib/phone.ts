// lib/phone.ts
// Envoltura tipada sobre la utilidad compartida @mrtpvrest/config/phone.
// La lógica (país→lada, normalización para wa.me) vive en el package compartido
// para que backend, delivery y admin usen exactamente las mismas reglas.

import * as sharedPhone from '@mrtpvrest/config/phone';

const { toWhatsappNumber: _toWhatsappNumber, whatsappUrl: _whatsappUrl } = sharedPhone as {
  toWhatsappNumber: (raw?: string | null, countryCode?: string) => string;
  whatsappUrl: (raw?: string | null, text?: string, countryCode?: string) => string;
};

/** Dígitos listos para wa.me (con lada del país, sin "+"); '' si no hay número. */
export function toWhatsappNumber(raw?: string | null, countryCode?: string): string {
  return _toWhatsappNumber(raw, countryCode);
}

/** URL completa de WhatsApp; '' si no hay número usable. */
export function whatsappUrl(raw?: string | null, text?: string, countryCode?: string): string {
  return _whatsappUrl(raw, text, countryCode);
}
