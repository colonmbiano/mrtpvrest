// Deep-link de carrito: serializa el carrito a `?cart=<b64url>` para compartir un
// pedido por link, y lo rehidrata al cargar la tienda RECONSTRUYÉNDOLO contra el
// menú vigente (precios/disponibilidad actuales; el precio final igual lo
// recalcula el backend al crear la orden). El link NO lleva precios: solo ids +
// selección, así no se puede manipular el importe.
import type { StoreProduct } from '../components/ProductModal';
import type { AddInput, CartLine } from './cartStore';

const COMPLEMENT_PREFIX = 'complement:';

// Forma compacta por línea en el link: m=menuItemId, v=variantId, o=modifierIds
// (incluye complementos con prefijo), c=combo [[componentId,optionId]], q=cant, n=nota.
type EncodedLine = { m: string; v?: string; o?: string[]; c?: [string, string][]; q: number; n?: string };

function b64urlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// Reconstruye una línea de carrito a partir de la selección codificada + el
// producto vigente. Valida variante/modificadores/complementos/combo contra el
// menú actual (descarta lo que ya no existe o está agotado) y re-precia. Devuelve
// null si el producto es inservible. Espeja la composición de ProductModal.
function buildLineFromEncoded(product: StoreProduct, e: EncodedLine): AddInput | null {
  const variants = product.variants || [];
  const variant = e.v ? variants.find((v) => v.id === e.v) : null;
  const basePrice = variant?.price ?? (product.isPromo && product.promoPrice ? product.promoPrice : product.price);

  const liveMods = (product.modifierGroups || []).flatMap((g) => g.modifiers);
  const complementsById = new Map((product.complements || []).map((c) => [c.id, c]));

  const keptModIds: string[] = [];
  let modifiersAdd = 0;
  const modNames: string[] = [];
  const complementNames: string[] = [];
  for (const id of e.o || []) {
    if (typeof id !== 'string') continue;
    if (id.startsWith(COMPLEMENT_PREFIX)) {
      const c = complementsById.get(id.slice(COMPLEMENT_PREFIX.length));
      if (c && (c as any).isAvailable !== false) { keptModIds.push(id); modifiersAdd += c.price || 0; complementNames.push(c.name); }
    } else {
      const m = liveMods.find((x) => x.id === id);
      if (m && m.isAvailable !== false) { keptModIds.push(id); modifiersAdd += m.priceAdd || 0; modNames.push(m.name); }
    }
  }

  // Combo: valida cada [componentId, optionId] contra los componentes vigentes.
  const comboComponents = product.comboComponents || [];
  const comboSelections: { componentId: string; optionId: string }[] = [];
  const comboNames: string[] = [];
  let comboAdd = 0;
  for (const pair of e.c || []) {
    const [componentId, optionId] = pair;
    const comp = comboComponents.find((k) => k.id === componentId);
    const opt = comp?.options.find((o) => o.id === optionId);
    if (comp && opt) {
      comboSelections.push({ componentId, optionId });
      comboAdd += opt.priceDelta || 0;
      if (opt.optionMenuItem?.name) comboNames.push(opt.optionMenuItem.name);
    }
  }

  const unitPrice = basePrice + modifiersAdd + comboAdd;
  const variantName = variant?.name || null;
  const extraNames = [...comboNames, ...modNames, ...complementNames];
  const displayName = [product.name, variantName ? `(${variantName})` : '', extraNames.length ? `· ${extraNames.join(', ')}` : '']
    .filter(Boolean).join(' ');

  const note = (e.n || '').trim();
  const comboSig = comboSelections.map((s) => `${s.componentId}:${s.optionId}`).sort().join(',');
  const key = `${product.id}|${variant?.id || ''}|${[...keptModIds].sort().join(',')}|${comboSig}|${note}`;

  return {
    id: key,
    menuItemId: product.id,
    name: displayName,
    price: unitPrice,
    variantId: variant?.id || null,
    modifierIds: keptModIds,
    comboSelections: comboSelections.length ? comboSelections : undefined,
    note: note || undefined,
    quantity: Math.max(1, e.q || 1),
  };
}

/** URL absoluta de la tienda con el carrito serializado en `?cart=`. */
export function cartShareUrl(slug: string, lines: CartLine[]): string {
  const encoded: EncodedLine[] = lines.map((l) => ({
    m: l.menuItemId,
    ...(l.variantId ? { v: l.variantId } : {}),
    ...(l.modifierIds && l.modifierIds.length ? { o: l.modifierIds } : {}),
    ...(l.comboSelections && l.comboSelections.length
      ? { c: l.comboSelections.map((s) => [s.componentId, s.optionId] as [string, string]) }
      : {}),
    q: l.quantity,
    ...(l.note ? { n: l.note } : {}),
  }));
  const param = b64urlEncode(JSON.stringify(encoded));
  const base = typeof window !== 'undefined' ? window.location.origin : `https://${slug}.mrtpvrest.com`;
  return `${base}/?cart=${param}`;
}

/**
 * Si la URL trae `?cart=`, rehidrata el carrito contra `products` y limpia el
 * parámetro (para no re-agregar al refrescar). Suma a lo que ya haya (no borra).
 */
export function hydrateCartFromUrl(products: StoreProduct[], add: (item: AddInput) => void): number {
  if (typeof window === 'undefined') return 0;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get('cart');
  if (!raw) return 0;
  // Quita el parámetro ANTES de agregar → refrescar no vuelve a inyectar.
  url.searchParams.delete('cart');
  window.history.replaceState({}, '', url.toString());

  let encoded: EncodedLine[];
  try {
    const parsed = JSON.parse(b64urlDecode(raw));
    if (!Array.isArray(parsed)) return 0;
    encoded = parsed;
  } catch { return 0; }

  const byId = new Map(products.map((p) => [p.id, p]));
  let added = 0;
  for (const e of encoded) {
    if (!e || typeof e.m !== 'string') continue;
    const product = byId.get(e.m);
    if (!product) continue;
    const line = buildLineFromEncoded(product, e);
    if (line) { add(line); added += 1; }
  }
  return added;
}
