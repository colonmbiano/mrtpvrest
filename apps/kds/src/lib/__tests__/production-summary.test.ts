import { buildProductionSummary } from "../production-summary";

describe("buildProductionSummary", () => {
  test("suma cantidades PENDIENTES por menuItemId y excluye las done", () => {
    const summary = buildProductionSummary([
      { items: [
        { menuItemId: "burger", menuItemName: "Burger", quantity: 2, done: false },
        { menuItemId: "fries", menuItemName: "Papas", quantity: 1, done: false },
        { menuItemId: "burger", menuItemName: "Burger", quantity: 3, done: true }, // done → excluido
      ] },
      { items: [
        { menuItemId: "burger", menuItemName: "Burger", quantity: 1, done: false },
      ] },
    ]);
    expect(summary.find((s) => s.menuItemId === "burger")?.qtyPending).toBe(3); // 2 + 1
    expect(summary.find((s) => s.menuItemId === "fries")?.qtyPending).toBe(1);
  });

  test("agrupa por id, NO por nombre (no fusiona homónimos)", () => {
    const summary = buildProductionSummary([
      { items: [
        { menuItemId: "a", menuItemName: "Especial", quantity: 1 },
        { menuItemId: "b", menuItemName: "Especial", quantity: 1 },
      ] },
    ]);
    expect(summary).toHaveLength(2);
  });

  test("desglosa combos en sus componentes (no cuenta el contenedor)", () => {
    const summary = buildProductionSummary([
      { items: [
        { menuItemId: "combo1", menuItemName: "Combo Burger", quantity: 2, comboSelections: [
          { optionMenuItemId: "burger", name: "Principal: Burger" },
          { optionMenuItemId: "frappe", name: "Bebida: Frappe" },
        ] },
      ] },
    ]);
    expect(summary.find((s) => s.menuItemId === "combo1")).toBeUndefined();
    expect(summary.find((s) => s.menuItemId === "burger")?.qtyPending).toBe(2);
    // El nombre del componente se limpia del prefijo "Slot: ".
    expect(summary.find((s) => s.menuItemId === "frappe")?.name).toBe("Frappe");
  });

  test("ordena por qtyPending descendente", () => {
    const summary = buildProductionSummary([
      { items: [
        { menuItemId: "a", quantity: 1 },
        { menuItemId: "b", quantity: 5 },
      ] },
    ]);
    expect(summary[0].menuItemId).toBe("b");
  });

  test("tolera entradas vacías o inválidas", () => {
    expect(buildProductionSummary([])).toEqual([]);
    expect(buildProductionSummary([{ items: [] }])).toEqual([]);
    expect(buildProductionSummary([{ items: [{ quantity: 1 }] }])).toEqual([]); // sin menuItemId
  });
});
