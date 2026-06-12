const connect = jest.fn().mockResolvedValue({ client: 7 });
const send = jest.fn().mockResolvedValue(undefined);
const disconnect = jest.fn().mockResolvedValue({ client: 7 });

jest.mock("capacitor-tcp-socket", () => ({
  TcpSocket: { connect, send, disconnect },
}));

import {
  printKitchenTickets,
  printCustomerReceipt,
  buildCustomerReceipt,
  buildKitchenTicket,
  paymentLabel,
  withLabel,
  formatProductLine,
  ivaBreakdown,
  lineAmount,
  splitItemsBySeat,
  packRaster,
  type ReceiptInput,
  type PrinterRecord,
} from "@/lib/printer-tcp";

// Extrae el importe ("$xxx.xx") que sigue a la primera aparición de `label`
// dentro del texto ESC/POS del recibo. Útil para afirmar sobre el renglón TOTAL
// / Subtotal / una línea de producto sin depender del padding exacto.
function amountAfter(receipt: string, label: string): number | null {
  const line = receipt.split("\n").find((l) => l.includes(label));
  if (!line) return null;
  const g1 = line.match(/\$\s?([\d,]+\.\d{2})/)?.[1];
  return g1 ? Number(g1.replace(/,/g, "")) : null;
}

beforeEach(() => {
  connect.mockClear();
  send.mockClear();
  disconnect.mockClear();
});

const CASHIER: PrinterRecord = {
  id: "c1", name: "Caja", type: "CASHIER", ip: "192.168.1.100", port: 9100,
  connectionType: "NETWORK", isActive: true,
};

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

describe("recibo :: la línea NO duplica el modificador (descuadre del total)", () => {
  it("lineAmount usa el subtotal persistido cuando viene (price ya incluye mods)", () => {
    // Backend moderno: price = base+mods = 165, subtotal = 165, modifier informativo.
    expect(lineAmount({ name: "Boneless", quantity: 1, price: 165, subtotal: 165, modifiers: [{ name: "Papas", priceAdd: 30 }] })).toBe(165);
    // 2x con subtotal persistido.
    expect(lineAmount({ name: "Combo", quantity: 2, price: 165, subtotal: 330, modifiers: [{ name: "Papas", priceAdd: 30 }] })).toBe(330);
  });

  it("lineAmount cae a precio+mods cuando NO viene subtotal (legacy)", () => {
    expect(lineAmount({ name: "Boneless", quantity: 1, price: 135, modifiers: [{ name: "Papas", priceAdd: 30 }] })).toBe(165);
  });

  it("la suma de los renglones cuadra con el TOTAL (caso Boneless+Papas)", () => {
    // Pedido real: Hamburguesa $135 + Boneless $165 (incl. Papas $30) = $300.
    const out = buildCustomerReceipt({
      orderNumber: "651661",
      orderType: "TAKEOUT",
      items: [
        { name: "Hamburguesa Arrachera House Super", quantity: 1, price: 135, subtotal: 135 },
        { name: "Boneless", quantity: 1, price: 165, subtotal: 165, modifiers: [{ name: "BBQ", priceAdd: 0 }, { name: "Papas Extra", priceAdd: 30 }] },
      ],
      subtotal: 300,
      total: 300,
      paymentMethod: "CASH",
    });
    // El renglón del Boneless muestra 165, NO 195 (antes se duplicaba la papa).
    expect(amountAfter(out, "Boneless")).toBe(165);
    // Productos = 135 + 165 = 300 = TOTAL.
    expect(amountAfter(out, "TOTAL:")).toBe(300);
    expect(out).not.toContain("195.00");
  });
});

describe("recibo :: envío (DELIVERY) desglosado y cuadrado", () => {
  it("imprime el renglón 'Envío:' y los productos + envío = TOTAL", () => {
    // Pedido a domicilio: productos $265 + envío $20 = $285.
    const out = buildCustomerReceipt({
      orderNumber: "454457",
      orderType: "DELIVERY",
      items: [
        { name: "Refrescos 600ml", quantity: 1, price: 35, subtotal: 35 },
        { name: "Alitas", quantity: 1, price: 105, subtotal: 105 },
        { name: "Taco", quantity: 3, price: 35, subtotal: 105 },
      ],
      subtotal: 245,
      deliveryFee: 20,
      total: 265, // 245 productos + 20 envío
      paymentMethod: "CASH",
    });
    expect(out).toContain("Envío:");
    expect(amountAfter(out, "Envío:")).toBe(20);
    expect(amountAfter(out, "TOTAL:")).toBe(265);
  });

  it("IVA del envío configurable: deliveryFeeTaxed=false saca el envío de la base", () => {
    const base = { orderNumber: "1", orderType: "DELIVERY" as const, items: [{ name: "X", quantity: 1, price: 100, subtotal: 100 }], subtotal: 100, deliveryFee: 16, total: 116, paymentMethod: "CASH" };
    // Con IVA (default): base gravable = 116/1.16 = 100, IVA = 16.
    const conIva = buildCustomerReceipt({ ...base, deliveryFeeTaxed: true });
    expect(amountAfter(conIva, "IVA (16% incl.):")).toBe(16);
    // Sin IVA en envío: base gravable = (116-16)/1.16 = 86.21, IVA = 13.79.
    const sinIva = buildCustomerReceipt({ ...base, deliveryFeeTaxed: false });
    expect(amountAfter(sinIva, "IVA (16% incl.):")).toBe(13.79);
    // El TOTAL no cambia por el tratamiento de IVA.
    expect(amountAfter(sinIva, "TOTAL:")).toBe(116);
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

describe("comanda :: título = nombre/mesa, sin 'COMANDA'", () => {
  it("imprime Mesa/cliente arriba y NO el título 'COMANDA' por defecto", () => {
    const out = buildKitchenTicket({
      orderType: "DINE_IN",
      tableNumber: "Mesa 5",
      customerName: "Ana",
      orderNumber: "1042",
      items: [{ name: "Taco", quantity: 1, price: 20 }],
    });
    expect(out).not.toContain("COMANDA");
    expect(out).toContain("Mesa 5");          // sin duplicar "Mesa"
    expect(out).not.toContain("Mesa Mesa");
    expect(out).toContain("Ana");
    // El nombre/mesa va ANTES del número de orden (es el título).
    expect(out.indexOf("Mesa 5")).toBeLessThan(out.indexOf("#1042"));
  });

  it("respeta un header explícito si el negocio lo configura", () => {
    const out = buildKitchenTicket({
      tableNumber: "3",
      items: [{ name: "X", quantity: 1, price: 1 }],
      config: { header: "COCINA CENTRAL" },
    });
    expect(out).toContain("COCINA CENTRAL");
  });
});

describe("recibo :: logo (raster ESC/POS)", () => {
  it("packRaster genera GS v 0 + dimensiones + bits correctos", () => {
    // 8x1, patrón 1010_1010 → un byte 0xAA tras la cabecera de 8 bytes.
    const out = packRaster([1, 0, 1, 0, 1, 0, 1, 0], 8, 1);
    expect(Array.from(out.slice(0, 8))).toEqual([0x1d, 0x76, 0x30, 0x00, 1, 0, 1, 0]);
    expect(out[8]).toBe(0xaa);
    expect(out.length).toBe(9);
  });

  it("packRaster redondea el ancho a múltiplo de 8 (padding con ceros)", () => {
    const out = packRaster([1, 1, 1], 3, 1); // 3 px → 1 byte
    expect(out[4]).toBe(1);      // widthBytes = 1
    expect(out[8]).toBe(0b11100000); // 3 bits altos en 1
  });

  it("en node (sin canvas) elimina el marker del logo sin romper la impresión", async () => {
    const res = await printCustomerReceipt([CASHIER], {
      ...baseReceipt,
      businessName: "Master Burger's",
      showLogo: true,
      logoUrl: "https://cdn.example.com/logo.png",
    });
    expect(res.ok).toBe(1);
    const sent = send.mock.calls.map(([a]) => a.data as string).join("");
    expect(sent).not.toContain("LOGO");          // el marker no llega a la impresora
    expect(sent).toContain("Master Burger's");   // el resto del recibo sí
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
