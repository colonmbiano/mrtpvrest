import { ONLINE_SOURCES, isMarketplaceOrder, kitchenPrintReady, needsAcceptance } from "@/lib/webOrders";

describe("pedidos web del TPV", () => {
  it("el marketplace es un canal web más, junto a la tienda y WhatsApp", () => {
    for (const source of ["ONLINE", "STORE", "WHATSAPP", "MARKETPLACE"]) {
      expect(ONLINE_SOURCES.has(source)).toBe(true);
    }
    expect(ONLINE_SOURCES.has("KIOSK")).toBe(false);
    expect(ONLINE_SOURCES.has("TPV")).toBe(false);
    expect(isMarketplaceOrder({ source: "marketplace" })).toBe(true);
    expect(isMarketplaceOrder({ source: "ONLINE" })).toBe(false);
    expect(isMarketplaceOrder(null)).toBe(false);
  });

  it("piden aceptar los nuevos de la tienda y los del marketplace por responder", () => {
    expect(needsAcceptance({ status: "PENDING" })).toBe(true);
    expect(needsAcceptance({ status: "PENDING_MERCHANT", source: "MARKETPLACE" })).toBe(true);
    for (const status of ["CONFIRMED", "PREPARING", "READY", "PENDING_PAYMENT"]) {
      expect(needsAcceptance({ status })).toBe(false);
    }
  });

  it("la cocina imprime un pedido del marketplace solo después de aceptarlo", () => {
    for (const status of ["PENDING_PAYMENT", "PENDING_MERCHANT", "CANCELLED"]) {
      expect(kitchenPrintReady({ source: "MARKETPLACE", status })).toBe(false);
    }
    expect(kitchenPrintReady({ source: "MARKETPLACE", status: "CONFIRMED" })).toBe(true);
    // Los demás canales siguen imprimiendo al entrar, como hoy.
    expect(kitchenPrintReady({ source: "ONLINE", status: "PENDING" })).toBe(true);
    expect(kitchenPrintReady({ source: "WHATSAPP", status: "PENDING" })).toBe(true);
  });
});
