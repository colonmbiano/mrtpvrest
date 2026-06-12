const connect = jest.fn().mockResolvedValue({ client: 7 });
const send = jest.fn().mockResolvedValue(undefined);
const disconnect = jest.fn().mockResolvedValue({ client: 7 });

jest.mock("capacitor-tcp-socket", () => ({
  TcpSocket: { connect, send, disconnect },
}));

import {
  printKitchenTickets,
  buildCustomerReceipt,
  paymentLabel,
  withLabel,
  formatProductLine,
  ivaBreakdown,
  splitItemsBySeat,
  type ReceiptInput,
} from "@/lib/printer-tcp";

const baseReceipt: ReceiptInput = {
  orderNumber: "1234",
  orderType: "DINE_IN",
  tableNumber: "Mesa 12",
  items: [{ name: "Boneless", quantity: 1, price: 135, modifiers: [{ name: "Papas Extra", priceAdd: 30 }] }],
  subtotal: 165,
  total: 165,
  paymentMethod: "CARD",
};

describe("recibo :: bugs de texto", () => {
  it("no duplica el label de Mesa ('Mesa Mesa 12')", () => {
    expect(withLabel("Mesa", "Mesa 12")).toBe("Mesa 12");
    expect(withLabel("Mesa", "12")).toBe("Mesa 12");
    const out = buildCustomerReceipt(baseReceipt);
    expect(out).toContain("Mesa 12");
    expect(out).not.toContain("Mesa Mesa");
  });

  it("traduce el método de pago a español (CARD → TARJETA)", () => {
    expect(paymentLabel("CARD")).toBe("TARJETA");
    expect(paymentLabel("CASH")).toBe("EFECTIVO");
    expect(paymentLabel("TRANSFER")).toBe("TRANSFERENCIA");
    expect(paymentLabel("CARD_PRESENT")).toBe("TARJETA");
    const out = buildCustomerReceipt(baseReceipt);
    expect(out).toContain("TARJETA");
    expect(out).not.toContain("Pagado con: CARD");
  });

  it("envuelve nombres largos a segunda línea con sangría (no trunca con …)", () => {
    const out = formatProductLine(1, "Hamburguesa Hawaiana Doble Con Piña", "$199.00", 32);
    expect(out).not.toContain("…");
    expect(out).toContain("Hawaiana");
    expect(out).toContain("Doble"); // conserva la info completa, no la corta
    // hay al menos un salto de línea extra (segunda línea sangrada)
    expect(out.split("\n").filter(Boolean).length).toBeGreaterThan(1);
  });
});

describe("recibo :: desglose IVA incluido", () => {
  it("subtotal = total/1.16, iva = total - subtotal", () => {
    expect(ivaBreakdown(116)).toEqual({ subtotal: 100, iva: 16 });
    const { subtotal, iva } = ivaBreakdown(485);
    expect(subtotal).toBe(418.1);
    expect(iva).toBe(66.9);
    expect(subtotal + iva).toBeCloseTo(485, 2);
  });

  it("imprime Subtotal, IVA (16% incl.) y TOTAL", () => {
    const out = buildCustomerReceipt({ ...baseReceipt, total: 116, subtotal: 116 });
    expect(out).toContain("Subtotal:");
    expect(out).toContain("IVA (16% incl.):");
    expect(out).toContain("TOTAL:");
  });
});

describe("recibo :: bloque de factura (QR)", () => {
  it("emite el QR y el folio sólo cuando showInvoiceQr + invoiceUrl", () => {
    const sin = buildCustomerReceipt(baseReceipt);
    expect(sin).not.toContain("¿Quieres tu factura?");
    const con = buildCustomerReceipt({
      ...baseReceipt,
      showInvoiceQr: true,
      invoiceUrl: "https://facturacion.masterburguers.com",
      invoiceFolio: "MB-00123",
    });
    expect(con).toContain("¿Quieres tu factura?");
    expect(con).toContain("facturacion.masterburguers.com");
    expect(con).toContain("MB-00123");
  });
});

describe("recibo :: split por comensal incluye modificadores", () => {
  it("el subtotal por asiento suma el priceAdd (no se pierde como en el bug del total)", () => {
    const seats = splitItemsBySeat(
      [{ name: "Boneless", quantity: 1, price: 135, seatNumber: 1, modifiers: [{ name: "Papas Extra", priceAdd: 30 }] }],
      2,
    );
    expect(seats[0].subtotal).toBe(165); // 135 + 30, no 135
  });
});



describe("printKitchenTickets", () => {
  it("reports a visible failure when there is no configured kitchen printer", async () => {
    const result = await printKitchenTickets([], {
      orderNumber: "1001",
      orderType: "DINE_IN",
      tableNumber: "4",
      items: [{ name: "Taco", quantity: 2, price: 35 }],
    });

    expect(result.ok).toBe(0);
    expect(result.failed).toEqual([
      expect.objectContaining({
        name: "Impresoras",
        error: expect.stringContaining("No hay impresoras"),
      }),
    ]);
  });

  it("prints one ticket per assignment when groups share the same printer", async () => {
    const result = await printKitchenTickets(
      [{
        id: "printer-1",
        name: "Cocina",
        type: "KITCHEN",
        ip: "192.168.1.50",
        port: 9100,
        connectionType: "NETWORK",
        isActive: true,
        printerGroupIds: ["plancha", "freidora"],
        printerGroupRefs: [
          { id: "plancha", name: "Plancha" },
          { id: "freidora", name: "Freidora" },
        ],
      }],
      {
        orderNumber: "1002",
        orderType: "DINE_IN",
        tableNumber: "5",
        config: { separateByGroup: true },
        items: [
          { name: "Hamburguesa", quantity: 1, price: 90, printerGroupIds: ["plancha"] },
          { name: "Papas", quantity: 1, price: 45, printerGroupIds: ["freidora"] },
        ],
      },
    );

    expect(result).toEqual({ ok: 2, failed: [] });
    expect(connect).toHaveBeenCalledTimes(2);
    const payloads = send.mock.calls.map(([arg]) => arg.data as string);
    expect(payloads.some((payload) => payload.includes("PLANCHA") && payload.includes("Hamburguesa"))).toBe(true);
    expect(payloads.some((payload) => payload.includes("FREIDORA") && payload.includes("Papas"))).toBe(true);
    expect(payloads.every((payload) => !(payload.includes("Hamburguesa") && payload.includes("Papas")))).toBe(true);
  });
});
