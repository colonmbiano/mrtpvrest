/**
 * @jest-environment node
 *
 * Cobertura de los helpers que arman las partes de un combo para la comanda de
 * cocina: desde el carrito (opciones aplanadas como modificadores) y desde un
 * pedido guardado (comboSelections enriquecidas por el backend).
 */
import {
  comboPartsFromCartItem,
  comboPartsFromOrderItem,
  COMBO_MODIFIER_PREFIX,
} from "../modifiers";

describe("comboPartsFromCartItem", () => {
  const cart = {
    isCombo: true,
    comboComponents: [
      {
        id: "c1", name: "Principal", minSelect: 1, maxSelect: 1, isRequired: true,
        options: [{
          id: "o1", optionMenuItemId: "mi1", priceDelta: 0,
          // estación por CATEGORÍA (default heredado)
          optionMenuItem: { id: "mi1", name: "Alitas BBQ", category: { printerGroups: [{ printerGroup: { id: "freidora" } }] } },
        }],
      },
      {
        id: "c2", name: "Bebida", minSelect: 1, maxSelect: 1, isRequired: true,
        options: [{
          id: "o2", optionMenuItemId: "mi2", priceDelta: 0,
          // estación por OVERRIDE del item (gana sobre la categoría)
          optionMenuItem: { id: "mi2", name: "Coca 600ml", printerGroups: [{ printerGroup: { id: "barra" } }] },
        }],
      },
    ],
    modifiers: [
      { id: `${COMBO_MODIFIER_PREFIX}c1:o1`, groupId: "__combo:c1", name: "Alitas BBQ", priceAdd: 0 },
      { id: `${COMBO_MODIFIER_PREFIX}c2:o2`, groupId: "__combo:c2", name: "Coca 600ml", priceAdd: 0 },
    ],
  };

  it("mapea cada opción elegida a su estación (override o categoría)", () => {
    expect(comboPartsFromCartItem(cart as never)).toEqual([
      { name: "Alitas BBQ", quantity: 1, printerGroupIds: ["freidora"] },
      { name: "Coca 600ml", quantity: 1, printerGroupIds: ["barra"] },
    ]);
  });

  it("ignora modificadores que no son de combo", () => {
    const withExtra = {
      ...cart,
      modifiers: [
        ...cart.modifiers,
        { id: "complement:x", groupId: "__complements", name: "Extra queso", priceAdd: 10 },
      ],
    };
    expect(comboPartsFromCartItem(withExtra as never)).toHaveLength(2);
  });

  it("[] si no es combo o no hay selecciones", () => {
    expect(comboPartsFromCartItem({ isCombo: false } as never)).toEqual([]);
    expect(comboPartsFromCartItem({ isCombo: true, comboComponents: cart.comboComponents, modifiers: [] } as never)).toEqual([]);
  });
});

describe("comboPartsFromOrderItem", () => {
  it("lee comboSelections ya enriquecidas por el backend", () => {
    expect(comboPartsFromOrderItem({
      comboSelections: [
        { name: "Alitas BBQ", printerGroupIds: ["freidora"] },
        { name: "Coca 600ml", printerGroupIds: ["barra"] },
      ],
    })).toEqual([
      { name: "Alitas BBQ", quantity: 1, printerGroupIds: ["freidora"] },
      { name: "Coca 600ml", quantity: 1, printerGroupIds: ["barra"] },
    ]);
  });

  it("estación vacía si el backend no la resolvió (fallback lo maneja después)", () => {
    expect(comboPartsFromOrderItem({ comboSelections: [{ name: "X" }] })).toEqual([
      { name: "X", quantity: 1, printerGroupIds: [] },
    ]);
  });

  it("[] sin selecciones", () => {
    expect(comboPartsFromOrderItem({})).toEqual([]);
    expect(comboPartsFromOrderItem({ comboSelections: null })).toEqual([]);
  });
});
