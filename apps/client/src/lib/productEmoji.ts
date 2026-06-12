// Emoji de respaldo cuando un producto/línea no tiene foto. Evita que postres,
// bebidas o papas muestren la hamburguesa genérica 🍔. Se elige por palabras
// clave del nombre del producto; si no hay match, cae a 🍽️ (neutral).
// Lo definitivo es subir las fotos reales a Cloudinary (dqvgidive).
const RULES: [RegExp, string][] = [
  [/papa|fren|fries|fritas?/i, '🍟'],
  [/refresc|soda|cola|bebida|agua|jugo|limonad|drink|smoothie|licuad/i, '🥤'],
  [/cerve|beer|chela|michela/i, '🍺'],
  [/caf[eé]|capuch|latte|moka|espresso|frapp/i, '☕'],
  [/postre|pastel|cake|helad|nieve|flan|dona|donut|brownie|galleta|dulce|cheesecake/i, '🍰'],
  [/pizza/i, '🍕'],
  [/taco/i, '🌮'],
  [/burrito|quesadill/i, '🌯'],
  [/hot ?dog|salchich/i, '🌭'],
  [/ensalad|salad/i, '🥗'],
  [/pollo|alit|wing|chicken|boneless/i, '🍗'],
  [/sushi|roll|nigiri/i, '🍣'],
  [/torta|sandwich|sándwich|baguet|sub\b/i, '🥪'],
  [/sopa|caldo|ramen|pozole/i, '🍜'],
  [/papas? a la francesa/i, '🍟'],
  [/hamburg|burger|burguer/i, '🍔'],
];

export function productEmoji(name?: string | null): string {
  if (!name) return '🍽️';
  for (const [re, emoji] of RULES) {
    if (re.test(name)) return emoji;
  }
  return '🍽️';
}
