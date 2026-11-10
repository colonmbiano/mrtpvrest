import { marketplacePendingSummary, waitingMinutes, ONLINE_SOURCES, chargeBlockedLabel, isMarketplaceOrder, itemsLocked, kitchenPrintReady, needsAcceptance } from "@/lib/webOrders";

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

  it("la caja no cobra un pedido del marketplace por aceptar, esperando pago o ya pagado", () => {
    expect(chargeBlockedLabel({ source: "MARKETPLACE", status: "PENDING_MERCHANT", paymentStatus: "PENDING" })).toBe("Por aceptar");
    expect(chargeBlockedLabel({ source: "MARKETPLACE", status: "PENDING_MERCHANT", paymentStatus: "PAID" })).toBe("Por aceptar");
    expect(chargeBlockedLabel({ source: "MARKETPLACE", status: "PENDING_PAYMENT", paymentStatus: "PENDING" })).toBe("Esperando pago");
    expect(chargeBlockedLabel({ source: "MARKETPLACE", status: "READY", paymentStatus: "PAID" })).toBe("Pagado en línea");
    // Aceptado y en efectivo (p. ej. recoger en tienda): sí se cobra en caja.
    expect(chargeBlockedLabel({ source: "MARKETPLACE", status: "READY", paymentStatus: "PENDING" })).toBeNull();
    // Los demás canales siguen como hoy.
    expect(chargeBlockedLabel({ source: "ONLINE", status: "PENDING", paymentStatus: "PAID" })).toBeNull();
    expect(chargeBlockedLabel(null)).toBeNull();
  });

  it("los productos de un pedido del marketplace no se editan en el TPV", () => {
    expect(itemsLocked({ source: "MARKETPLACE", status: "CONFIRMED" })).toBe(true);
    expect(itemsLocked({ source: "ONLINE", status: "PENDING" })).toBe(false);
    expect(itemsLocked({ source: "TPV" })).toBe(false);
  });
});


describe("espera de pedidos del Mercadito", () => {
  const createdAt = "2026-11-10T12:00:00Z";
  const order = { source: "MARKETPLACE", status: "PENDING_MERCHANT", createdAt };
  const at = Date.parse(createdAt);
  it("cuenta minutos completos y tolera fechas inválidas o futuras", () => {
    expect(waitingMinutes(order, at + 119_999)).toBe(1);
    expect(waitingMinutes(order, at - 1)).toBe(0);
    expect(waitingMinutes({ ...order, createdAt: "bad" }, at)).toBe(0);
  });
  it("muestra el banner solo después de cinco minutos y mientras requiere aceptación", () => {
    expect(marketplacePendingSummary([order], at + 300_000)).toEqual({ count: 1, overdue: false });
    expect(marketplacePendingSummary([order], at + 300_001)).toEqual({ count: 1, overdue: true });
    expect(marketplacePendingSummary([{ ...order, status: "CONFIRMED" }], at + 600_000)).toEqual({ count: 0, overdue: false });
    expect(marketplacePendingSummary([{ ...order, source: "ONLINE" }], at + 600_000)).toEqual({ count: 0, overdue: false });
  });
});
