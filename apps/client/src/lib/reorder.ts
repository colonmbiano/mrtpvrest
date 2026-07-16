// "Volver a pedir": reconstruye el carrito a partir de un pedido pasado,
// matcheando cada línea contra el MENÚ VIGENTE (precios/disponibilidad actuales).
// El precio final SIEMPRE lo recalcula el backend al recrear la orden — aquí solo
// armamos el carrito para que el cliente lo revise y confirme.
//
// Limitaciones honestas (por cómo se persiste OrderItem):
//   · La variante NO se guarda como id (va dentro del nombre "Producto (Variante)")
//     → se re-matchea por nombre; si no casa, cae a la primera variante.
//   · Los complementos y la selección de combos NO se guardan de forma
//     reconstruible → los combos se OMITEN (se reportan para agregar a mano).
import type { StoreProduct } from '../components/ProductModal';
import type { AddInput } from './cartStore';
import type { CustomerOrder, CustomerOrderItem } from './customerAuth';

export type ReorderResult = {
  added: number;
  skipped: { name: string; reason: string }[];
};

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

// Extrae el nombre de variante del nombre guardado del item, matcheándolo contra
// las variantes reales del producto (evita confundir paréntesis del propio
// nombre, ej. "Coca (600ml)", con una variante).
function matchVariant(item: CustomerOrderItem, product: StoreProduct) {
  const variants = product.variants || [];
  if (variants.length === 0) return null;
  const parens = [...(item.name || '').matchAll(/\(([^)]+)\)/g)].map((m) => norm(m[1]));
  for (const p of parens) {
    const v = variants.find((x) => norm(x.name) === p);
    if (v) return v;
  }
  // Tenía variante pero no casó ninguna → default a la primera (el cliente ajusta).
  return variants[0];
}

function buildLine(item: CustomerOrderItem, product: StoreProduct): AddInput | null {
  // Combos: la selección no se persiste de forma reconstruible → no se re-arma.
  if (product.isCombo && (product.comboComponents?.length || 0) > 0) return null;

  const variant = matchVariant(item, product);
  const basePrice =
    variant?.price ??
    (product.isPromo && product.promoPrice ? product.promoPrice : product.price);

  // Modificadores reales que SIGUEN existiendo y disponibles en el menú actual.
  // (Los complementos se guardaron solo como texto en notas → no se restauran.)
  const liveMods = (product.modifierGroups || []).flatMap((g) => g.modifiers);
  const keptMods = (item.modifiers || [])
    .map((m) => m.modifierId)
    .filter((id): id is string => !!id)
    .map((id) => liveMods.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m && m.isAvailable !== false);

  const modifierIds = keptMods.map((m) => m.id);
  const modifiersAdd = keptMods.reduce((s, m) => s + (m.priceAdd || 0), 0);
  const unitPrice = basePrice + modifiersAdd;

  const variantName = variant?.name || null;
  const modNames = keptMods.map((m) => m.name);
  const displayName = [product.name, variantName ? `(${variantName})` : '', modNames.length ? `· ${modNames.join(', ')}` : '']
    .filter(Boolean)
    .join(' ');

  // Misma llave de línea que ProductModal (sin combo ni nota) → el carrito
  // fusiona cantidades si el cliente vuelve a agregar el mismo combo de opciones.
  const key = `${product.id}|${variant?.id || ''}|${[...modifierIds].sort().join(',')}||`;

  return {
    id: key,
    menuItemId: product.id,
    name: displayName,
    price: unitPrice,
    variantId: variant?.id || null,
    modifierIds,
    quantity: Math.max(1, item.quantity || 1),
  };
}

/**
 * Re-agrega al carrito los items de `order` que se puedan reconstruir contra
 * `products` (menú vigente). Devuelve cuántos entraron y cuáles se omitieron.
 */
export function reorderIntoCart(
  order: CustomerOrder,
  products: StoreProduct[],
  add: (item: AddInput) => void,
): ReorderResult {
  const byId = new Map(products.map((p) => [p.id, p]));
  let added = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const item of order.items || []) {
    const product = byId.get(item.menuItemId);
    if (!product) {
      skipped.push({ name: item.name, reason: 'ya no está en el menú' });
      continue;
    }
    const line = buildLine(item, product);
    if (!line) {
      skipped.push({ name: item.name, reason: 'combo — agrégalo desde el menú' });
      continue;
    }
    add(line);
    added += 1;
  }

  return { added, skipped };
}
