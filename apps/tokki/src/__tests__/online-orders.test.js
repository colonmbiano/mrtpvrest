import { isOnlineOrder, orderItemsToTicketItems, orderTypeName, shouldAutoPrintOrder } from "../lib/online-orders";

test.each(["ONLINE", "STORE", "WHATSAPP", "KIOSK"])("reconoce el canal %s como pedido entrante", (source) => {
  expect(isOnlineOrder({ source })).toBe(true);
});

test("no imprime tarjeta hasta que el pago esté confirmado", () => {
  expect(shouldAutoPrintOrder({ id: "o1", source: "ONLINE", status: "PENDING", paymentMethod: "CARD", paymentStatus: "PENDING" })).toBe(false);
  expect(shouldAutoPrintOrder({ id: "o1", source: "ONLINE", status: "CONFIRMED", paymentMethod: "CARD", paymentStatus: "PAID" })).toBe(true);
});

test("imprime contra entrega aunque siga pendiente de cobro", () => {
  expect(shouldAutoPrintOrder({ id: "o2", source: "ONLINE", status: "PENDING", paymentMethod: "CASH", paymentStatus: "PENDING" })).toBe(true);
});

test("no imprime órdenes canceladas, reembolsadas ni creadas por el TPV", () => {
  expect(shouldAutoPrintOrder({ id: "o3", source: "ONLINE", status: "CANCELLED", paymentMethod: "CASH", paymentStatus: "PENDING" })).toBe(false);
  expect(shouldAutoPrintOrder({ id: "o4", source: "ONLINE", status: "PENDING", paymentMethod: "CASH", paymentStatus: "REFUNDED" })).toBe(false);
  expect(shouldAutoPrintOrder({ id: "o5", source: "TPV", status: "PENDING", paymentMethod: "CASH", paymentStatus: "PENDING" })).toBe(false);
});

test("convierte modificadores y ruteo de impresora para la comanda", () => {
  expect(orderItemsToTicketItems([{ name: "Panda", quantity: 2, unitPrice: 80, modifiers: [{ name: "Tapioca", priceAdd: 0 }], menuItem: { printerGroups: [{ printerGroup: { id: "bar" } }] } }])).toEqual([
    expect.objectContaining({ name: "Panda", quantity: 2, price: 80, modifiers: [{ name: "Tapioca", priceAdd: 0 }], printerGroupIds: ["bar"] }),
  ]);
  expect(orderTypeName("DELIVERY")).toBe("A domicilio");
});
