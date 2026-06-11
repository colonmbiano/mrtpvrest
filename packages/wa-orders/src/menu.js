// Menú de la tienda: lo trae del endpoint público del backend y lo aplana a
// "unidades ordenables" (producto + variante) para que el parser pueda hacer
// match contra nombres concretos. No confía en precios — el backend recalcula
// todo al crear el pedido; aquí solo necesitamos ids y etiquetas para matchear.

const DEFAULT_API_BASE = process.env.WA_API_BASE || "https://api.mrtpvrest.com";

/**
 * Trae el menú de una tienda por slug.
 * @returns {Promise<{items: Array, units: Array}>}
 *   units = lista plana de { menuItemId, variantId|null, label, price, item }
 */
export async function fetchMenu(slug, apiBase = DEFAULT_API_BASE) {
  const url = `${apiBase}/api/store/menu?r=${encodeURIComponent(slug)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`No se pudo obtener el menú (${res.status}) de ${slug}`);
  }
  const data = await res.json();
  const items = Array.isArray(data.items) ? data.items : [];
  const units = [];
  for (const it of items) {
    const variants = Array.isArray(it.variants) ? it.variants : [];
    if (variants.length > 0) {
      for (const v of variants) {
        units.push({
          menuItemId: it.id,
          variantId: v.id,
          label: `${it.name} ${v.name}`.trim(),
          price: Number(v.price ?? it.price ?? 0),
          item: it,
        });
      }
    } else {
      units.push({
        menuItemId: it.id,
        variantId: null,
        label: it.name,
        price: Number(
          it.isPromo && it.promoPrice ? it.promoPrice : it.price ?? 0,
        ),
        item: it,
      });
    }
  }
  return { items, units };
}
