/**
 * @jest-environment node
 *
 * Entorno node a propósito: la lógica de printer-tcp es pura (texto + bytes)
 * y el caso "sin canvas" depende de que document/Image NO existan. En jsdom
 * `new Image()` existe pero jamás dispara onload/onerror (jsdom no carga
 * recursos), así que loadImage dejaba el test colgado hasta el timeout.
 */
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
  splitItemsBySeat,
  packRaster,
  isValidIPv4,
  sanitizeIp,
  sendRawTcp,
  type ReceiptInput,
  type PrinterRecord,
} from "@/lib/printer-tcp";

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

describe("validación de IP", () => {
  it("acepta IPv4 válidas y rechaza hostnames/typos", () => {
    expect(isValidIPv4("192.168.1.84")).toBe(true);
    expect(isValidIPv4("0.0.0.0")).toBe(true);
    expect(isValidIPv4("192.168.1.84 ")).toBe(false); // espacio
    expect(isValidIPv4("192.168.1")).toBe(false);     // incompleta
    expect(isValidIPv4("192.168.1.300")).toBe(false); // octeto > 255
    expect(isValidIPv4("EPSON-TM20")).toBe(false);    // hostname
    expect(isValidIPv4("192,168.1.84")).toBe(false);  // coma
  });

  it("sanitizeIp quita whitespace interno y de bordes (registros viejos)", () => {
    expect(sanitizeIp(" 192.168.1.84 ")).toBe("192.168.1.84");
    expect(sanitizeIp("192.168. 1.84")).toBe("192.168.1.84");
    expect(sanitizeIp(null)).toBe("");
  });

  it("sendRawTcp limpia espacios de IPs guardadas y conecta con la IP sana", async () => {
    await sendRawTcp({ ip: " 192.168.1.84 ", port: 9100 }, "x");
    expect(connect).toHaveBeenCalledWith({ ipAddress: "192.168.1.84", port: 9100 });
  });

  it("sendRawTcp rechaza IP inválida con mensaje claro, sin tocar el socket", async () => {
    await expect(sendRawTcp({ ip: "EPSON-TM20", port: 9100 }, "x")).rejects.toThrow(/IP de impresora invalida/);
    expect(connect).not.toHaveBeenCalled();
  });
});

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
