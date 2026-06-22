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
  comboKitchenDetail,
  paymentLabel,
  withLabel,
  formatProductLine,
  ivaBreakdown,
  splitItemsBySeat,
  packRaster,
  isValidIPv4,
  sanitizeIp,
  sendRawTcp,
  buildShiftCloseTicket,
  type ReceiptInput,
  type PrinterRecord,
  type ShiftCloseTicketInput,
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
  // `price` ya incluye los modificadores de pago (135 base + 30 Papas Extra = 165),
  // igual que order_item.price del backend y el unitPrice del carrito local.
  items: [{ name: "Boneless", quantity: 1, price: 165, modifiers: [{ name: "Papas Extra", priceAdd: 30 }] }],
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

// Extrae el importe ("$xxx.xx") que sigue a la primera aparición de `label`
// dentro del texto ESC/POS del recibo. Sirve para afirmar sobre el renglón
// TOTAL / Subtotal / Envío sin depender del padding exacto.
function amountAfter(receipt: string, label: string): number | null {
  const line = receipt.split("\n").find((l) => l.includes(label));
  if (!line) return null;
  const g1 = line.match(/\$\s?([\d,]+\.\d{2})/)?.[1];
  return g1 ? Number(g1.replace(/,/g, "")) : null;
}

describe("recibo :: envío (DELIVERY) desglosado y cuadrado", () => {
  it("imprime el renglón 'Envío:' y productos + envío = TOTAL", () => {
    // Pedido a domicilio: productos $245 + envío $20 = $265.
    const out = buildCustomerReceipt({
      orderNumber: "454457",
      orderType: "DELIVERY",
      items: [
        { name: "Refrescos 600ml", quantity: 1, price: 35 },
        { name: "Alitas", quantity: 1, price: 105 },
        { name: "Taco", quantity: 3, price: 35 },
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

  it("sin envío no imprime el renglón 'Envío:'", () => {
    const out = buildCustomerReceipt({ ...baseReceipt, orderType: "DELIVERY" });
    expect(out).not.toContain("Envío:");
  });

  it("IVA del envío configurable: deliveryFeeTaxed=false saca el envío de la base", () => {
    const base = {
      orderNumber: "1", orderType: "DELIVERY" as const,
      items: [{ name: "X", quantity: 1, price: 100 }],
      subtotal: 100, deliveryFee: 16, total: 116, paymentMethod: "CASH",
    };
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

describe("comanda :: desglose de combo/promo (kitchenDetail)", () => {
  it("imprime el desglose entre paréntesis bajo el nombre cuando viene kitchenDetail y el toggle está activo", () => {
    const out = buildKitchenTicket({
      orderType: "TAKEOUT",
      config: { showItemDescription: true },
      items: [
        {
          name: "Botana de Papás",
          quantity: 1,
          price: 329,
          kitchenDetail: "1 kg de alitas + papas gajo + 2 cervezas",
        },
      ],
    });
    expect(out).toContain("Botana de Papás");
    expect(out).toContain("(1 kg de alitas + papas gajo + 2 cervezas)");
  });

  it("con el toggle apagado (default) NO imprime el desglose aunque venga kitchenDetail", () => {
    const out = buildKitchenTicket({
      orderType: "TAKEOUT",
      items: [
        {
          name: "Botana de Papás",
          quantity: 1,
          price: 329,
          kitchenDetail: "1 kg de alitas + papas gajo + 2 cervezas",
        },
      ],
    });
    expect(out).toContain("Botana de Papás");
    expect(out).not.toContain("(1 kg de alitas + papas gajo + 2 cervezas)");
  });

  it("sin kitchenDetail no agrega sub-línea (productos normales quedan limpios)", () => {
    const out = buildKitchenTicket({
      items: [{ name: "Burger de Res Clásica", quantity: 1, price: 92 }],
    });
    expect(out).toContain("Burger de Res Clásica");
    expect(out).not.toContain("(");
  });

  it("comboKitchenDetail solo devuelve descripción cuando el item es promo", () => {
    expect(
      comboKitchenDetail({ isPromo: true, description: "alitas + 2 cervezas" }),
    ).toBe("alitas + 2 cervezas");
    // Producto normal con descripción de menú → no se imprime en cocina.
    expect(
      comboKitchenDetail({ isPromo: false, description: "viene con papas fritas" }),
    ).toBeNull();
    expect(comboKitchenDetail({ isPromo: true, description: "  " })).toBeNull();
    expect(comboKitchenDetail(null)).toBeNull();
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

describe("recibo :: split por comensal usa el precio inclusivo", () => {
  it("el subtotal por asiento toma el price (que ya incluye el priceAdd), sin duplicarlo", () => {
    const seats = splitItemsBySeat(
      // price ya incluye Papas Extra (135 + 30 = 165), como en producción.
      [{ name: "Boneless", quantity: 1, price: 165, seatNumber: 1, modifiers: [{ name: "Papas Extra", priceAdd: 30 }] }],
      2,
    );
    expect(seats[0].subtotal).toBe(165); // price inclusivo, no se re-suma el priceAdd
  });
});

describe("recibo :: la línea NO duplica el modificador (incidente TPV-048483)", () => {
  it("imprime price×qty (modificador ya incluido), no price + priceAdd", () => {
    const money = (n: number) =>
      n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
    const out = buildCustomerReceipt({
      ...baseReceipt,
      // KFC: 85 base + 30 Papas Extra ya horneados en price = 115.
      items: [{ name: "KFC Pollo Burger", quantity: 1, price: 115, modifiers: [{ name: "Papas Extra", priceAdd: 30 }] }],
      subtotal: 115,
      total: 115,
    });
    expect(out).toContain(money(115));     // línea correcta = lo cobrado
    expect(out).not.toContain(money(145)); // 115 + 30 duplicado: el bug original
  });
});

describe("recibo :: opciones POR LÍNEA (de-clutter del ticket)", () => {
  const money = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
  const base: ReceiptInput = {
    ...baseReceipt,
    items: [{ name: "Hamburguesa", quantity: 1, price: 165, notes: "Sin cebolla", modifiers: [{ name: "Tocino", priceAdd: 30 }] }],
    subtotal: 165,
    total: 165,
  };

  it("showItemsPrice=false oculta los importes por línea pero conserva el TOTAL", () => {
    const conPrecio = buildCustomerReceipt({ ...base, showItemsPrice: true });
    const sinPrecio = buildCustomerReceipt({ ...base, showItemsPrice: false });
    expect(conPrecio).toContain("+" + money(30)); // modificador con su importe
    expect(sinPrecio).not.toContain("+" + money(30));
    expect(sinPrecio).toContain("TOTAL:"); // el total siempre se imprime
  });

  it("receiptShowNotes / showModifiers gatean notas y modificadores", () => {
    expect(buildCustomerReceipt({ ...base, showNotes: true })).toContain("Sin cebolla");
    expect(buildCustomerReceipt({ ...base, showNotes: false })).not.toContain("Sin cebolla");
    expect(buildCustomerReceipt({ ...base, showModifiers: false })).not.toContain("Tocino");
    expect(buildCustomerReceipt({ ...base, showModifiers: true })).toContain("Tocino");
  });

  it("showItemSeparator agrega una línea punteada extra entre productos", () => {
    const dos: ReceiptInput = {
      ...base,
      items: [
        { name: "Hamburguesa", quantity: 1, price: 165 },
        { name: "Refresco", quantity: 1, price: 35 },
      ],
      subtotal: 200,
      total: 200,
    };
    // Los separadores de SECCIÓN ya son punteados (estilo Loyverse), así que
    // contamos líneas de puntos: activar el separador suma una más (la que va
    // entre los dos productos).
    const dottedLines = (s: string) => (s.match(/\.{10,}/g) || []).length;
    const con = dottedLines(buildCustomerReceipt({ ...dos, showItemSeparator: true }));
    const sin = dottedLines(buildCustomerReceipt({ ...dos, showItemSeparator: false }));
    expect(con).toBeGreaterThan(sin);
  });
});

describe("recibo :: estilo Loyverse (cantidad aparte, CUENTA/RECIBO)", () => {
  const money = (n: number) =>
    n.toLocaleString("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });

  it("imprime la cantidad × precio unitario en un renglón aparte", () => {
    const out = buildCustomerReceipt({
      ...baseReceipt,
      items: [{ name: "Manzanas", quantity: 2, price: 15 }],
      subtotal: 30,
      total: 30,
    });
    expect(out).toContain("Manzanas");
    expect(out).toContain(`2 x ${money(15)}`); // renglón de cantidad × unitario
    expect(out).toContain(money(30));          // total de la línea
    expect(out).not.toContain("2x Manzanas");  // ya no usa el prefijo viejo
  });

  it("paid===false → título CUENTA y total 'Pendiente de cobro'", () => {
    const cuenta = buildCustomerReceipt({ ...baseReceipt, paid: false });
    expect(cuenta).toContain("CUENTA");
    expect(cuenta).toContain("Pendiente de cobro");
    expect(cuenta).not.toContain("TOTAL:");
  });

  it("paid===true (o sin dato) → título RECIBO y total TOTAL", () => {
    const recibo = buildCustomerReceipt({ ...baseReceipt, paid: true });
    expect(recibo).toContain("RECIBO");
    expect(recibo).toContain("TOTAL:");
    expect(recibo).not.toContain("Pendiente de cobro");
    // sin el flag se comporta como recibo pagado
    expect(buildCustomerReceipt(baseReceipt)).toContain("TOTAL:");
  });

  it("usa labels Empleado/TPV (no Cajero/Terminal)", () => {
    const out = buildCustomerReceipt({ ...baseReceipt, cashierName: "Ana", terminalName: "Caja 1" });
    expect(out).toContain("Empleado:");
    expect(out).toContain("TPV:");
    expect(out).not.toContain("Cajero:");
    expect(out).not.toContain("Terminal:");
  });

  it("emite el QR de lealtad sólo con showLoyaltyQr + loyaltyUrl", () => {
    const sin = buildCustomerReceipt(baseReceipt);
    expect(sin).not.toContain("Acumula puntos");
    const con = buildCustomerReceipt({
      ...baseReceipt,
      showLoyaltyQr: true,
      loyaltyUrl: "https://masterburguers.mrtpvrest.com",
    });
    expect(con).toContain("Acumula puntos");
    expect(con).toContain("masterburguers.mrtpvrest.com");
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

describe("buildShiftCloseTicket", () => {
  const base: ShiftCloseTicketInput = {
    shiftId: "cmqbhk6a500001toitnnzzuq6",
    businessName: "Master Burger's",
    openedAt: "2026-06-12T22:16:13.000Z",
    closedAt: "2026-06-13T07:15:27.000Z",
    cashierName: "Eduardo",
    openingFloat: 1026,
    totalCash: 15305,
    totalCard: 505,
    totalTransfer: 2248.9,
    totalCourtesy: 210,
    totalExpenses: 1100,
    totalSales: 18268.9,
    ordersCount: 62,
    closingFloat: 13181,
    expectedCash: 15231,
    expenses: [
      { description: "Verduras", amount: 608 },
      { description: "Harina/jabon", amount: 116 },
    ],
  };

  it("imprime ventas por método, total y gastos línea por línea", () => {
    const t = buildShiftCloseTicket(base);
    expect(t).toContain("CORTE DE TURNO");
    expect(t).toContain("Master Burger's");
    expect(t).toContain("Efectivo:");
    expect(t).toContain("Transferencia:");
    expect(t).toContain("Verduras");      // gasto línea por línea
    expect(t).toContain("Harina/jabon");
    expect(t).toContain("Ordenes:");
  });

  it("muestra el DESFASE (faltante) en corte normal", () => {
    const t = buildShiftCloseTicket(base);
    expect(t).toContain("ESPERADO");
    expect(t).toContain("DESFASE");
    expect(t).toContain("FALTANTE"); // 13181 - 15231 < 0
  });

  it("oculta el desfase en corte ciego sin reveal", () => {
    const t = buildShiftCloseTicket({ ...base, blindClose: true, expectedCash: null });
    expect(t).toContain("CORTE CIEGO");
    expect(t).not.toContain("DESFASE");
    expect(t).not.toContain("ESPERADO");
    expect(t).toContain("Contado:"); // sí muestra lo contado
  });

  it("revela el desfase en corte ciego cuando reveal=true", () => {
    const t = buildShiftCloseTicket({ ...base, blindClose: true, reveal: true });
    expect(t).toContain("DESFASE");
    expect(t).toContain("ESPERADO");
    expect(t).not.toContain("CORTE CIEGO");
  });

  it("marca SOBRANTE cuando lo contado supera lo esperado", () => {
    const t = buildShiftCloseTicket({ ...base, closingFloat: 16000 });
    expect(t).toContain("SOBRANTE");
  });
});
