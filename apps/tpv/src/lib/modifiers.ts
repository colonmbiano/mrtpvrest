/**
 * modifiers.ts — constantes compartidas para identificar el origen de un
 * `ModifierSelection` dentro de un item del ticket.
 *
 * El configurador de producto (inline en `app/pos/menu/page.tsx`) aplana
 * variantes multi-select y complementos como modificadores, prefijando su id
 * para que `SidebarTicket` pueda distinguirlos al renderizar/editar.
 *
 * Antes estas constantes vivían en `components/pos/ModifierPickerModal.tsx`,
 * cuyo componente quedó muerto (el configurador vive inline en la página).
 * Se movieron aquí para poder eliminar ese archivo y los dos modales
 * duplicados (`ProductConfiguratorModal`, `VariantPickerModal`).
 */

export const COMPLEMENT_MODIFIER_PREFIX = "complement:";
export const VARIANT_MODIFIER_PREFIX = "variant:";
