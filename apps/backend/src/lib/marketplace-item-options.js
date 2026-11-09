'use strict';

// Variantes y modificadores de un producto del Mercadito (C4 de la auditoría del 9/nov/2026).
// Precio SIEMPRE del servidor, en centavos enteros: el comprador solo manda ids.
//
// Reglas (las del menú del comercio, las mismas que usa el TPV):
//   - Variante: si llega `variantId`, su precio reemplaza al del producto (como la tienda en línea).
//     Debe existir en el producto y estar disponible.
//   - Modificadores: cada id debe pertenecer a un grupo del producto y estar disponible.
//     Por grupo: mínimo = max(1 si es obligatorio, minSelection); máximo = maxSelection si es > 0,
//     o 1 si el grupo no es de selección múltiple. Solo los grupos QUANTITY admiten repetir un id
//     ("2 Salsa"). Los primeros `freeModifiersLimit` de un grupo no cobran (los más baratos primero,
//     igual que lib/money.js applyFreeModifiers).
//   - Todos los grupos del producto se revisan, también los que llegaron sin selección: un grupo
//     obligatorio no se puede saltar.
// Combos, venta por peso y complementos siguen fuera del Mercadito (los filtra el catálogo).

const MAX_MODIFIERS = 30;

// listing: { name, unitPriceCents, variants: [{ id, name, priceCents, available }],
//   groups: [{ id, name, required, multiSelect, minSelection, maxSelection, freeModifiersLimit, groupType,
//   modifiers: [{ id, name, priceAddCents, available }] }] }
// selection: { variantId?, modifierIds? } ya normalizada (ids de texto).
// check(ok, code, message, status): el mismo verificador de la cotización (un solo tipo de error).
function priceItemOptions(listing, selection, check) {
  const name = listing.name;
  let unitPriceCents = listing.unitPriceCents;
  let variantName = null;
  let variantId = null;
  if (selection.variantId) {
    const variant = (listing.variants || []).find(row => row.id === selection.variantId);
    check(variant, 'OPTION_NOT_FOUND', `La opción elegida ya no existe en "${name}"`, 409);
    check(variant.available === true, 'OPTION_NOT_AVAILABLE', `"${variant.name}" no está disponible en "${name}"`, 409);
    check(Number.isSafeInteger(variant.priceCents) && variant.priceCents > 0, 'INVALID_CATALOG_PRICE', 'Precio no disponible', 503);
    unitPriceCents = variant.priceCents;
    variantName = variant.name;
    variantId = variant.id;
  }

  const ids = selection.modifierIds || [];
  check(ids.length <= MAX_MODIFIERS, 'INVALID_OPTIONS', `Demasiadas opciones en "${name}"`, 422);
  const groups = listing.groups || [];
  const groupOf = new Map();
  for (const group of groups) for (const mod of group.modifiers || []) groupOf.set(mod.id, { group, mod });
  const chosen = new Map(groups.map(group => [group.id, []]));
  for (const id of ids) {
    const found = groupOf.get(id);
    check(found, 'OPTION_NOT_FOUND', `Una opción elegida ya no existe en "${name}"`, 409);
    check(found.mod.available === true, 'OPTION_NOT_AVAILABLE', `"${found.mod.name}" no está disponible en este momento`, 409);
    check(Number.isSafeInteger(found.mod.priceAddCents) && found.mod.priceAddCents >= 0, 'INVALID_CATALOG_PRICE', 'Precio no disponible', 503);
    chosen.get(found.group.id).push(found.mod);
  }

  let extrasCents = 0;
  const modifiers = [];
  for (const group of groups) {
    const picked = chosen.get(group.id);
    const quantity = group.groupType === 'QUANTITY';
    const min = Math.max(group.required ? 1 : 0, Number.isInteger(group.minSelection) ? group.minSelection : 0);
    const max = Number.isInteger(group.maxSelection) && group.maxSelection > 0 ? group.maxSelection
      : (group.multiSelect || quantity ? Infinity : 1);
    if (!quantity) {
      check(new Set(picked.map(mod => mod.id)).size === picked.length, 'INVALID_OPTIONS',
        `En "${group.name}" cada opción se elige una sola vez`, 422);
    }
    check(picked.length >= min, 'INVALID_OPTIONS', min === 1
      ? `Elige una opción en "${group.name}"` : `Elige al menos ${min} opciones en "${group.name}"`, 422);
    check(picked.length <= max, 'INVALID_OPTIONS', max === 1
      ? `En "${group.name}" solo se elige una opción` : `En "${group.name}" se eligen máximo ${max} opciones`, 422);
    // Gratis los más baratos primero, hasta el límite del grupo.
    const free = Number.isInteger(group.freeModifiersLimit) && group.freeModifiersLimit > 0 ? group.freeModifiersLimit : 0;
    const charged = [...picked].sort((a, b) => a.priceAddCents - b.priceAddCents || (a.id < b.id ? -1 : 1))
      .map((mod, index) => ({ mod, cents: index < free ? 0 : mod.priceAddCents }));
    if (quantity) {
      // Snapshot compacto: "2 Salsa" con el cargo sumado, como el TPV.
      const counts = new Map();
      for (const { mod, cents } of charged) {
        const entry = counts.get(mod.id) || { mod, count: 0, cents: 0 };
        entry.count++; entry.cents += cents; counts.set(mod.id, entry);
      }
      for (const { mod, count, cents } of counts.values()) {
        modifiers.push({ modifierId: mod.id, name: `${count} ${mod.name}`, priceAddCents: cents });
        extrasCents += cents;
      }
    } else {
      for (const { mod, cents } of charged) {
        modifiers.push({ modifierId: mod.id, name: mod.name, priceAddCents: cents });
        extrasCents += cents;
      }
    }
  }
  return {
    name: variantName ? `${name} (${variantName})` : name,
    variantId,
    unitPriceCents: unitPriceCents + extrasCents,
    modifiers,
  };
}

module.exports = { priceItemOptions, MAX_MODIFIERS };
