import {
  buildStationOrdersView,
  mergeServerAndTcpOrders,
  normalizeOrderNumber,
  tcpTicketToKdsOrder,
  type LanFirstState,
  type LanFirstOrder,
} from "../lan-first";
import type { LocalKitchenTicket } from "../local-tickets";

const emptyState: LanFirstState = {
  itemOverrides: {},
  orderNumItemOverrides: {},
  finalizedOrderIds: [],
  finalizedOrderNumbers: [],
  mutationQueue: [],
};

describe("lan-first", () => {
  test("normaliza el número de orden quitando # y espacios", () => {
    expect(normalizeOrderNumber(" #6367 ")).toBe("6367");
    expect(normalizeOrderNumber("6367")).toBe("6367");
  });

  test("convierte una comanda TCP local en tarjeta KdsOrder para el tablero principal", () => {
    const ticket: LocalKitchenTicket = {
      id: "tcp-1000-0-abcd",
      receivedAt: 1700000000000,
      from: "192.168.1.50",
      lines: ["COMANDA", "#6400", "Mesa 5", "---", "2x Hamburguesa Clásica", "+ Extra queso", "> Sin cebolla"],
      headerLines: ["Mesero Juan"],
      isKitchen: true,
      isReceipt: false,
      orderNumber: "6400",
      tableLabel: "5",
      items: [
        {
          quantity: 2,
          name: "Hamburguesa Clásica",
          modifiers: ["Extra queso"],
          notes: ["Sin cebolla"],
          group: "COMENSAL 1",
        },
      ],
    };

    const order = tcpTicketToKdsOrder(ticket, "KITCHEN", emptyState);
    expect(order).not.toBeNull();
    expect(order?.orderNumber).toBe("6400");
    expect(order?.isLocalTcp).toBe(true);
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0]?.menuItemName).toBe("Hamburguesa Clásica");
    expect(order?.items[0]?.quantity).toBe(2);
    expect(order?.items[0]?.modifiers?.[0]?.name).toBe("Extra queso");
    expect(order?.items[0]?.notes).toBe("Sin cebolla");
  });

  test("deduplica comandas TCP cuando el servidor ya devolvió el mismo #orderNumber y conserva overrides locales", () => {
    const ticket: LocalKitchenTicket = {
      id: "tcp-1000-0-abcd",
      receivedAt: 1700000000000,
      from: "192.168.1.50",
      lines: ["COMANDA", "#6367"],
      headerLines: [],
      isKitchen: true,
      isReceipt: false,
      orderNumber: "6367",
      tableLabel: "4",
      items: [{ quantity: 1, name: "Papas a la Francesa", modifiers: [], notes: [] }],
    };

    const serverOrders: LanFirstOrder[] = [
      {
        id: "ord-server-1",
        orderNumber: "6367",
        orderType: "DINE_IN",
        createdAt: new Date(1700000000000).toISOString(),
        items: [
          {
            id: "item-server-1",
            menuItemId: "m-1",
            menuItemName: "Papas a la Francesa",
            quantity: 1,
            done: false,
          },
        ],
      },
    ];

    const stateWithOverride: LanFirstState = {
      ...emptyState,
      orderNumItemOverrides: { "6367::0": true },
    };

    const merged = mergeServerAndTcpOrders(serverOrders, [ticket], "KITCHEN", stateWithOverride, true);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe("ord-server-1");
    expect(merged[0]?.items[0]?.done).toBe(true);
    expect(merged[0]?.preparationComplete).toBe(true);
  });

  test("oculta inmediatamente pedidos finalizados en local (0 ms optimistic finalize)", () => {
    const serverOrders: LanFirstOrder[] = [
      {
        id: "ord-server-2",
        orderNumber: "6368",
        orderType: "TAKEOUT",
        createdAt: new Date().toISOString(),
        items: [{ id: "it-1", menuItemId: "m-1", menuItemName: "Alitas", quantity: 1, done: true }],
      },
    ];

    const finalizedState: LanFirstState = {
      ...emptyState,
      finalizedOrderIds: ["ord-server-2"],
    };

    const merged = mergeServerAndTcpOrders(serverOrders, [], "KITCHEN", finalizedState, true);
    expect(merged).toHaveLength(0);
  });

  test("Cocina General muestra todas las estaciones en una comanda; Plancha y Freidora filtran aparte", () => {
    const kitchenOrder: LanFirstOrder = {
      id: "ord-6391",
      orderNumber: "6391",
      orderType: "TAKEOUT",
      createdAt: "2026-11-12T04:10:00.000Z",
      items: [
        { id: "local-item-1", menuItemId: "m-volcan", menuItemName: "Volcán", quantity: 1, done: false },
        { id: "local-item-3", menuItemId: "m-tacos", menuItemName: "Tacos", quantity: 1, done: false },
        { id: "local-item-4", menuItemId: "m-papas", menuItemName: "Papas a la Francesa", quantity: 1, done: false },
      ],
    };

    const fryerOrder: LanFirstOrder = {
      id: "ord-6391",
      orderNumber: "6391",
      orderType: "TAKEOUT",
      createdAt: "2026-11-12T04:10:00.000Z",
      items: [
        { id: "local-item-0", menuItemId: "m-boneless", menuItemName: "Boneless", quantity: 1, done: false },
        { id: "local-item-2", menuItemId: "m-alitas", menuItemName: "Alitas", quantity: 1, done: false },
        { id: "local-item-4", menuItemId: "m-papas", menuItemName: "Papas a la Francesa", quantity: 1, done: true },
      ],
    };

    const stationMap = { KITCHEN: [kitchenOrder], FRYER: [fryerOrder] };

    const generalView = buildStationOrdersView(stationMap, "KITCHEN");
    expect(generalView).toHaveLength(1);
    expect(generalView[0]?.items.map((i) => ({ name: i.menuItemName, area: i.areaLabel, done: i.done }))).toEqual([
      { name: "Boneless", area: "Freidora", done: false },
      { name: "Volcán", area: "Plancha", done: false },
      { name: "Alitas", area: "Freidora", done: false },
      { name: "Tacos", area: "Plancha", done: false },
      { name: "Papas a la Francesa", area: "Freidora", done: true },
    ]);

    const grillView = buildStationOrdersView(stationMap, "GRILL");
    expect(grillView).toHaveLength(1);
    expect(grillView[0]?.items.map((i) => i.menuItemName)).toEqual(["Volcán", "Tacos"]);

    const fryerView = buildStationOrdersView(stationMap, "FRYER");
    expect(fryerView).toHaveLength(1);
    expect(fryerView[0]?.items.map((i) => i.menuItemName)).toEqual(["Boneless", "Alitas", "Papas a la Francesa"]);
  });
});
