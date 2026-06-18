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

/**
 * Nombre de GRUPO DE MODIFICADORES legible para el cajero.
 *
 * Los grupos suelen nombrarse en BD con convenciones internas tipo
 * "MOD BURGER EXTRAS" o "MOD COMMON PAPAS EXTRA" (prefijos administrativos que
 * no significan nada para quien cobra). Aquí se quitan esos prefijos y se
 * aplica Title Case. Solo capa de presentación — NO toca la BD.
 *
 * Se quitan, solo si aparecen como palabra completa al inicio:
 *   "MOD COMMON …"  → "…"
 *   "MOD …"         → "…"
 *   "COMMON …"      → "…"
 * Nunca recorta palabras como "MODO" o "COMODÍN" (exige límite de palabra).
 * Si tras quitar el prefijo no queda nada, cae al nombre original formateado.
 *
 * Ejemplos:
 *   "MOD BURGER EXTRAS"      → "Burger Extras"
 *   "MOD COMMON PAPAS EXTRA" → "Papas Extra"
 *   "Salsas"                 → "Salsas"
 */
export function formatModifierGroupName(input: string | null | undefined): string {
  if (!input) return '';
  const stripped = String(input)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^mod\b\s*/i, '')      // "MOD " inicial
    .replace(/^common\b\s*/i, '');  // "COMMON " que pudiera quedar tras "MOD"
  const formatted = formatDisplayName(stripped);
  // Si el nombre era solo prefijo(s), no dejar el grupo sin etiqueta.
  return formatted || formatDisplayName(input);
}
