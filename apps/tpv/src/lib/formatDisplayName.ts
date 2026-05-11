/**
 * Normaliza nombres mostrados al usuario a Title Case consistente.
 *
 * Reglas:
 *  - Mayúscula inicial en cada palabra de 3+ letras
 *  - Stopwords cortas en minúscula (de, la, el, y, e, o, u, en, con, del…)
 *    excepto la primera palabra
 *  - Trim + colapsar espacios múltiples
 *  - Conserva caracteres acentuados (ñ, á, é, í, ó, ú)
 *
 * Solo capa de presentación. NO modifica los datos en BD.
 *
 * Ejemplos:
 *   "SUPER HAMBURGUESAS" → "Super Hamburguesas"
 *   "Las clasicas"       → "Las Clasicas"
 *   "bebidas"            → "Bebidas"
 *   "ALITAS Y BONELESS"  → "Alitas y Boneless"
 */
const STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los',
  'y', 'e', 'o', 'u',
  'a', 'al', 'en', 'con', 'por', 'para', 'sin',
]);

export function formatDisplayName(input: string | null | undefined): string {
  if (!input) return '';
  const cleaned = String(input).trim().replace(/\s+/g, ' ');
  if (!cleaned) return '';

  return cleaned
    .toLocaleLowerCase('es-MX')
    .split(' ')
    .map((word, idx) => {
      if (idx > 0 && STOPWORDS.has(word)) return word;
      if (word.length === 0) return word;
      return word.charAt(0).toLocaleUpperCase('es-MX') + word.slice(1);
    })
    .join(' ');
}
