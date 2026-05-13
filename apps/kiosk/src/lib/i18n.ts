"use client";
import { useEffect, useState } from "react";

// i18n minimalista para el kiosko. Sin dependencia externa — diccionario
// inline con 2 idiomas (ES default, EN para mercado turístico).
//
// Para agregar idioma: extender `Lang` type + dictionary `STRINGS`.

export type Lang = "es" | "en";

const STRINGS = {
  // Idle
  "idle.tap":            { es: "Toca para ordenar",     en: "Tap to order"            },

  // Order type
  "orderType.title":     { es: "¿Aquí o para llevar?",  en: "Dine in or takeout?"     },
  "orderType.dineIn":    { es: "Aquí",                  en: "Dine in"                 },
  "orderType.takeout":   { es: "Para llevar",           en: "Takeout"                 },

  // Menu
  "menu.title":          { es: "Elige tus productos",   en: "Choose your items"       },
  "menu.empty":          { es: "Sin productos",         en: "No items"                },
  "menu.cart":           { es: "Tu pedido",             en: "Your order"              },
  "menu.cartEmpty":      { es: "Carrito vacío",         en: "Empty cart"              },
  "menu.checkout":       { es: "Pagar",                 en: "Checkout"                },

  // Variant Picker
  "picker.choose":       { es: "Elige una opción",      en: "Choose an option"        },
  "picker.required":     { es: "Requerido",             en: "Required"                },
  "picker.optional":     { es: "Opcional",              en: "Optional"                },
  "picker.addCart":      { es: "Agregar al pedido",     en: "Add to order"            },
  "picker.total":        { es: "Total",                 en: "Total"                   },

  // Checkout
  "checkout.title":      { es: "Confirmar orden",       en: "Confirm order"           },
  "checkout.back":       { es: "← Volver al menú",      en: "← Back to menu"          },
  "checkout.yourOrder":  { es: "Tu orden",              en: "Your order"              },
  "checkout.addNote":    { es: "+ Agregar nota",        en: "+ Add note"              },
  "checkout.notePh":     { es: "Sin cebolla, picante extra…", en: "No onion, extra spicy…" },
  "checkout.tableNum":   { es: "Número de mesa",        en: "Table number"            },
  "checkout.yourName":   { es: "Tu nombre (para cantar la orden)", en: "Your name (for pickup)" },
  "checkout.payCash":    { es: "Pagar en caja",         en: "Pay at counter"          },
  "checkout.payCard":    { es: "Pagar con tarjeta",     en: "Pay with card"           },
  "checkout.noTerminal": { es: "Terminal no configurada", en: "Terminal not configured" },

  // Coupon
  "coupon.have":         { es: "¿Tienes un cupón?",     en: "Have a coupon?"          },
  "coupon.code":         { es: "Código",                en: "Code"                    },
  "coupon.apply":        { es: "Aplicar",               en: "Apply"                   },
  "coupon.invalid":      { es: "Cupón inválido",        en: "Invalid coupon"          },

  // Loyalty
  "loyalty.have":        { es: "¿Eres cliente frecuente?", en: "Frequent customer?"   },
  "loyalty.code":        { es: "Código de cliente",     en: "Customer code"           },
  "loyalty.link":        { es: "Vincular",              en: "Link"                    },
  "loyalty.notFound":    { es: "Cliente no encontrado", en: "Customer not found"      },

  // Tip
  "tip.title":           { es: "¿Quieres dejar propina?", en: "Leave a tip?"          },
  "tip.none":            { es: "Sin",                   en: "None"                    },
  "tip.other":           { es: "Otro",                  en: "Other"                   },
  "tip.amount":          { es: "Monto en $",            en: "Amount $"                },

  // Summary
  "summary.subtotal":    { es: "Subtotal",              en: "Subtotal"                },
  "summary.tip":         { es: "Propina",               en: "Tip"                     },
  "summary.total":       { es: "Total",                 en: "Total"                   },

  // Success
  "success.order":       { es: "Orden",                 en: "Order"                   },
  "success.preparing":   { es: "Preparando",            en: "Preparing"               },
  "success.ready":       { es: "¡Lista!",               en: "Ready!"                  },
  "success.received":    { es: "Recibida",              en: "Received"                },
  "success.confirmed":   { es: "Confirmada",            en: "Confirmed"               },
  "success.backIn":      { es: "Volviendo al inicio en",en: "Returning home in"       },
  "success.newOrder":    { es: "Nueva orden",           en: "New order"               },

  // Accessibility
  "a11y.larger":         { es: "Texto grande",          en: "Larger text"             },
  "a11y.contrast":       { es: "Alto contraste",        en: "High contrast"           },
} as const;

type StringKey = keyof typeof STRINGS;

const KEY = "kiosk-lang";

export function useLang(): { lang: Lang; setLang: (l: Lang) => void; t: (k: StringKey) => string } {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (stored === "es" || stored === "en") setLangState(stored);
  }, []);

  function setLang(l: Lang) {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch {}
  }

  function t(k: StringKey): string {
    return STRINGS[k]?.[lang] || STRINGS[k]?.es || k;
  }

  return { lang, setLang, t };
}

// ── Accesibilidad ──
const A11Y_KEY = "kiosk-a11y";

export type A11yState = { larger: boolean; contrast: boolean };

export function useA11y(): { a11y: A11yState; toggle: (k: keyof A11yState) => void } {
  const [a11y, setA11yState] = useState<A11yState>({ larger: false, contrast: false });

  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(A11Y_KEY) : null;
    if (raw) {
      try { setA11yState({ larger: false, contrast: false, ...JSON.parse(raw) }); } catch {}
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.fontSize = a11y.larger ? "20px" : "";
    document.documentElement.dataset.contrast = a11y.contrast ? "high" : "";
  }, [a11y]);

  function toggle(k: keyof A11yState) {
    const next = { ...a11y, [k]: !a11y[k] };
    setA11yState(next);
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(next)); } catch {}
  }

  return { a11y, toggle };
}
