/**
 * modifiers.ts — constantes y helpers compartidos del configurador de
 * producto (variantes / modificadores / complementos).
 *
 * El configurador aplana variantes multi-select y complementos como
 * modificadores, prefijando su id para que el payload y el ticket puedan
 * distinguirlos. Los helpers puros viven aquí para que el POS principal
 * (`app/pos/menu/page.tsx`) y la pantalla de meseros
 * (`components/waiter/ProductConfigSheet.tsx`) compartan exactamente la
 * misma lógica de agrupado, precio y validación.
 *
 * Antes estas constantes vivían en `components/pos/ModifierPickerModal.tsx`,
 * cuyo componente quedó muerto (el configurador vive inline en la página).
 */
import type {
  MenuItemVariant,
  Modifier,
  ModifierGroup,
  ModifierSelection,
  Product,
} from "@/store/ticketStore";

export const COMPLEMENT_MODIFIER_PREFIX = "complement:";
export const VARIANT_MODIFIER_PREFIX = "variant:";
// Opción de combo aplanada como modificador: id = "combo:<componentId>:<optionId>".
export const COMBO_MODIFIER_PREFIX = "combo:";

export const COMPLEMENTS_GROUP_ID = "__complements";
export const VARIANTS_GROUP_ID = "__variants";

// ¿El producto necesita configurador antes de ir al ticket?
export function hasQuickOptions(product: Product): boolean {
  return (
    (product.hasVariants && (product.variants?.some((v) => v.isAvailable !== false) ?? false)) ||
    (product.modifierGroups?.some((group) => group.modifiers?.length > 0) ?? false) ||
    (product.complements?.some((complement) => complement.isAvailable !== false) ?? false) ||
    (product.isCombo === true && (product.comboComponents?.length ?? 0) > 0)
  );
}

export function buildOptionGroups(
  product: Product,
  variants: MenuItemVariant[],
  variantMultiSelect: boolean,
): ModifierGroup[] {
  const variantGroups: ModifierGroup[] = variantMultiSelect
    ? [
        {
          id: VARIANTS_GROUP_ID,
          name: "Variantes",
          required: (product.variantMinSelection ?? 0) > 0,
          multiSelect: true,
          minSelection: product.variantMinSelection ?? 0,
          maxSelection: product.variantMaxSelection ?? 0,
          freeModifiersLimit: 0,
          modifiers: variants.map((variant) => ({
            id: `${VARIANT_MODIFIER_PREFIX}${variant.id}`,
            groupId: VARIANTS_GROUP_ID,
            name: variant.name,
            priceAdd: Number(variant.price || 0),
          })),
        },
      ]
    : [];

  const complements = (product.complements || []).filter((complement) => complement.isAvailable !== false);
  const complementGroups: ModifierGroup[] =
    complements.length === 0
      ? []
      : [
          {
            id: COMPLEMENTS_GROUP_ID,
            name: "Complementos",
            required: false,
            multiSelect: true,
            minSelection: 0,
            maxSelection: 0,
            freeModifiersLimit: 0,
            modifiers: complements.map((complement) => ({
              id: `${COMPLEMENT_MODIFIER_PREFIX}${complement.id}`,
              groupId: COMPLEMENTS_GROUP_ID,
              name: complement.name,
              priceAdd: Number(complement.price || 0),
            })),
          },
        ];

  // Componentes del combo aplanados como grupos: cada opción es un "modificador"
  // con priceAdd = priceDelta. El id "combo:<comp>:<opt>" lo separa
  // splitModifierSelections en comboSelections para el backend.
  const comboGroups: ModifierGroup[] = (product.isCombo ? (product.comboComponents || []) : []).map((comp) => ({
    id: `__combo:${comp.id}`,
    name: comp.name,
    required: comp.isRequired !== false,
    multiSelect: (comp.maxSelect || 1) > 1,
    minSelection: comp.isRequired !== false ? Math.max(1, comp.minSelect || 1) : (comp.minSelect || 0),
    maxSelection: comp.maxSelect || 1,
    freeModifiersLimit: 0,
    modifiers: (comp.options || [])
      .filter((opt) => opt.isAvailable !== false)
      .map((opt) => ({
        id: `${COMBO_MODIFIER_PREFIX}${comp.id}:${opt.id}`,
        groupId: `__combo:${comp.id}`,
        name: opt.optionMenuItem?.name || "Opción",
        priceAdd: Number(opt.priceDelta || 0),
      })),
  }));

  return [...variantGroups, ...comboGroups, ...(product.modifierGroups || []), ...complementGroups];
}

export function computeUnitExtra(
  groups: ModifierGroup[],
  selectionsByGroup: Record<string, Modifier[]>,
): number {
  let extra = 0;
  for (const group of groups) {
    const selected = selectionsByGroup[group.id] || [];
    const free = group.freeModifiersLimit || 0;
    [...selected]
      .sort((a, b) => a.priceAdd - b.priceAdd)
      .forEach((modifier, index) => {
        if (index >= free) extra += Number(modifier.priceAdd || 0);
      });
  }
  return extra;
}

export function getValidationError(
  groups: ModifierGroup[],
  selections: Record<string, Modifier[]>,
  variantCount: number,
  selectedVariant: MenuItemVariant | null,
  variantMultiSelect: boolean,
): string | null {
  if (!variantMultiSelect && variantCount > 0 && !selectedVariant) return "Selecciona una variante";
  for (const group of groups) {
    const count = (selections[group.id] || []).length;
    const min = Math.max(group.required ? 1 : 0, group.minSelection || 0);
    if (count < min) return `Selecciona ${min} en ${group.name}`;
    if (group.maxSelection > 0 && count > group.maxSelection) return `Maximo ${group.maxSelection} en ${group.name}`;
  }
  return null;
}

export function flattenSelections(
  groups: ModifierGroup[],
  selections: Record<string, Modifier[]>,
): ModifierSelection[] {
  const modifiers: ModifierSelection[] = [];
  for (const group of groups) {
    for (const modifier of selections[group.id] || []) {
      modifiers.push({
        id: modifier.id,
        groupId: group.id,
        name: modifier.name,
        priceAdd: modifier.priceAdd,
      });
    }
  }
  return modifiers;
}

// Separa las selecciones aplanadas en las tres colecciones que espera el
// backend (`POST /api/orders/tpv` y `/:id/rounds`): modificadores reales,
// complementos y variantes multi-select (estas dos viajan con id prefijado).
// Item mínimo que el backend necesita para reconstruir una línea de orden.
// El precio NUNCA se manda: el servidor lo re-lee del catálogo (anti-manipulación).
export interface OrderItemPayloadInput {
  menuItemId: string;
  variantId?: string | null;
  quantity: number;
  // Peso en kg para líneas vendidas por báscula (soldByWeight). El backend
  // solo lo respeta si el producto es por peso; cobra price/kg × kg.
  weightKg?: number | null;
  notes?: string | null;
  seatNumber?: number | null;
  modifiers?: ModifierSelection[];
}

// Construye el payload de items para POST /api/orders/tpv y /:id/items.
// Centralizado aquí para que el envío a cocina (SidebarTicket) y el guardado
// automático al imprimir cuenta (layout) usen exactamente el mismo shape.
export function buildOrderItemsPayload(items: OrderItemPayloadInput[]) {
  return items.map((item) => ({
    menuItemId: item.menuItemId,
    variantId: item.variantId ?? null,
    quantity: item.quantity,
    ...(item.weightKg != null ? { weightKg: item.weightKg } : {}),
    notes: item.notes || "",
    seatNumber: item.seatNumber ?? null,
    ...splitModifierSelections(item.modifiers || []),
  }));
}

export function splitModifierSelections(modifiers: ModifierSelection[]): {
  modifiers: { modifierId: string }[];
  complements: { complementId: string }[];
  variants: { variantId: string }[];
  comboSelections: { componentId: string; optionId: string }[];
} {
  const complementIds = modifiers
    .map((m) => (m.id.startsWith(COMPLEMENT_MODIFIER_PREFIX) ? m.id.slice(COMPLEMENT_MODIFIER_PREFIX.length) : null))
    .filter((id): id is string => Boolean(id));
  const variantIds = modifiers
    .map((m) => (m.id.startsWith(VARIANT_MODIFIER_PREFIX) ? m.id.slice(VARIANT_MODIFIER_PREFIX.length) : null))
    .filter((id): id is string => Boolean(id));
  // "combo:<componentId>:<optionId>" → { componentId, optionId }. Los ids son
  // cuids (sin ':'), así que el primer ':' separa componente de opción.
  const comboSelections = modifiers
    .map((m) => {
      if (!m.id.startsWith(COMBO_MODIFIER_PREFIX)) return null;
      const rest = m.id.slice(COMBO_MODIFIER_PREFIX.length);
      const idx = rest.indexOf(":");
      if (idx < 0) return null;
      return { componentId: rest.slice(0, idx), optionId: rest.slice(idx + 1) };
    })
    .filter((x): x is { componentId: string; optionId: string } => Boolean(x));
  return {
    modifiers: modifiers
      .filter(
        (m) =>
          !m.id.startsWith(COMPLEMENT_MODIFIER_PREFIX) &&
          !m.id.startsWith(VARIANT_MODIFIER_PREFIX) &&
          !m.id.startsWith(COMBO_MODIFIER_PREFIX),
      )
      .map((m) => ({ modifierId: m.id })),
    complements: complementIds.map((complementId) => ({ complementId })),
    variants: variantIds.map((variantId) => ({ variantId })),
    comboSelections,
  };
}
