const net = require('net');
const { prisma } = require('@mrtpvrest/database');

// ── ESC/POS helpers ───────────────────────────────────────────────────────
const ESC = '\x1b';
const GS  = '\x1d';
const CMD = {
  INIT:        ESC + '@',
  CUT:         GS  + 'V' + '\x41' + '\x03',
  BOLD_ON:     ESC + 'E' + '\x01',
  BOLD_OFF:    ESC + 'E' + '\x00',
  DOUBLE_ON:   GS  + '!' + '\x11',  // Doble ancho y alto
  DOUBLE_OFF:  GS  + '!' + '\x00',
  ALIGN_LEFT:  ESC + 'a' + '\x00',
  ALIGN_CENTER:ESC + 'a' + '\x01',
  ALIGN_RIGHT: ESC + 'a' + '\x02',
  LINE:        '--------------------------------\n',
  LINE_DOUBLE: '================================\n',
  LF:          '\n',
  // ESC p m t1 t2 — pulso al cajón de dinero. m=0 → conector "drawer 1",
  // t1=25 (on = 25 × 2ms = 50ms), t2=250 (off). Compatible con la mayoría
  // de impresoras térmicas ESC/POS (Epson, Star, Bixolon, genéricas chinas).
  DRAWER_KICK: ESC + 'p' + '\x00' + '\x19' + '\xFA',
};

function normalizeThermalText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¡¿]/g, '')
    .replace(/[·•]/g, '-')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/[^\x00-\x7F]/g, '');
}

async function printToIp(ip, port, data, isKDS = false, normalizeText = true) {
  if (ip === '0.0.0.0' || !ip) {
    console.log('[printer] Skip printToIp for virtual device (0.0.0.0)');
    return Promise.resolve();
  }

  // Si es un KDS nativo, podemos enviar JSON en lugar de ESC/POS crudo
  // pero mantendremos compatibilidad enviando el buffer de datos solicitado.
  const printableData = normalizeText ? normalizeThermalText(data) : data;
  const payload = isKDS ? printableData : Buffer.from(printableData, 'binary');

  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Timeout')); }, 5000);
    client.connect(port || 9100, ip, () => {
      client.write(payload);
      client.end();
    });
    client.on('close', () => { clearTimeout(timeout); resolve(); });
    client.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

function pad(str, len) {
  str = String(str || '');
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function padLeft(str, len) {
  str = String(str || '');
  if (str.length >= len) return str.substring(0, len);
  return ' '.repeat(len - str.length) + str;
}

function row(left, right, total = 32) {
  const rightStr = String(right);
  const leftStr  = String(left);
  const spaces   = total - leftStr.length - rightStr.length;
  return leftStr + ' '.repeat(Math.max(1, spaces)) + rightStr + '\n';
}

// ── TICKET DE COCINA ──────────────────────────────────────────────────────
function buildKitchenTicket(order, items, stationName) {
  const now = new Date().toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  let d = CMD.INIT;

  // Encabezado
  d += CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON;
  d += '*** COCINA - ' + (stationName || 'ESTACION') + ' ***\n';
  d += CMD.BOLD_OFF;
  d += CMD.LINE_DOUBLE;

  // Numero de orden GRANDE
  d += CMD.ALIGN_CENTER;
  d += CMD.DOUBLE_ON;
  d += CMD.BOLD_ON;
  d += order.orderNumber + '\n';
  d += CMD.DOUBLE_OFF;
  d += CMD.BOLD_OFF;

  // Info cliente y mesa
  d += CMD.ALIGN_LEFT;
  if (order.customerName || order.user?.name) {
    d += CMD.BOLD_ON;
    d += 'Cliente: ' + (order.customerName || order.user?.name) + '\n';
    d += CMD.BOLD_OFF;
  }
  if (order.tableNumber) {
    d += CMD.DOUBLE_ON;
    d += CMD.BOLD_ON;
    d += 'MESA: ' + order.tableNumber + '\n';
    d += CMD.DOUBLE_OFF;
    d += CMD.BOLD_OFF;
  }
  const typeLabel = order.orderType === 'DINE_IN' ? 'EN MESA' : order.orderType === 'TAKEOUT' ? 'PARA LLEVAR' : 'DOMICILIO';
  d += typeLabel + ' · ' + now + '\n';
  d += CMD.LINE;

  // Productos - letra grande, sin precios
  items.forEach(item => {
    d += CMD.DOUBLE_ON;
    d += CMD.BOLD_ON;
    d += item.quantity + 'x ' + (item.name || item.menuItem?.name) + '\n';
    d += CMD.DOUBLE_OFF;
    d += CMD.BOLD_OFF;
    // Variante
    if (item.variantName) {
      d += CMD.BOLD_ON;
      d += '  > ' + item.variantName + '\n';
      d += CMD.BOLD_OFF;
    }
    // Notas y modificadores RESALTADOS
    if (item.notes) {
      d += CMD.BOLD_ON;
      d += '  *** ' + item.notes + ' ***\n';
      d += CMD.BOLD_OFF;
    }
    d += CMD.LF;
  });

  d += CMD.LINE_DOUBLE;
  d += CMD.LF + CMD.LF + CMD.LF;
  d += CMD.CUT;
  return d;
}

// ── TICKET DE COBRO ───────────────────────────────────────────────────────
function buildCashierTicket(order, config) {
  const now = new Date().toLocaleString('es-MX', { dateStyle:'short', timeStyle:'short' });
  const items = order.items || [];
  const subtotal = Number(order.subtotal) || items.reduce((s, i) => s + Number(i.subtotal), 0);
  const discount = Number(order.discount) || 0;
  const total    = Number(order.total) || subtotal - discount;

  let d = CMD.INIT;

  // Logo / Encabezado
  d += CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON;
  if (config?.showLogo !== false && config?.businessName) {
    d += CMD.DOUBLE_ON;
    d += config.businessName + '\n';
    d += CMD.DOUBLE_OFF;
  }
  if (config?.header) d += config.header + '\n';
  d += CMD.BOLD_OFF;
  if (config?.address) d += config.address + '\n';
  if (config?.phone)   d += 'Tel: ' + config.phone + '\n';
  d += CMD.LINE_DOUBLE;

  // Datos del pedido
  d += CMD.ALIGN_LEFT;
  d += row('Pedido:', order.orderNumber);
  d += row('Fecha:', now);
  if (order.customerName || order.user?.name) d += row('Cliente:', order.customerName || order.user?.name);
  if (order.tableNumber) d += row('Mesa:', order.tableNumber);
  const typeLabel = order.orderType === 'DINE_IN' ? 'En mesa' : order.orderType === 'TAKEOUT' ? 'Para llevar' : 'Domicilio';
  d += row('Tipo:', typeLabel);
  d += CMD.LINE;

  // Productos con precios
  d += CMD.BOLD_ON;
  d += row(pad('Producto', 20), padLeft('Total', 10));
  d += CMD.BOLD_OFF;
  d += CMD.LINE;

  items.forEach(item => {
    const name = (item.name || item.menuItem?.name || '').substring(0, 20);
    const itemTotal = Number(item.subtotal).toFixed(2);
    d += row(item.quantity + 'x ' + name, '$' + itemTotal);
    if (item.notes) d += '  + ' + item.notes + '\n';
  });
  d += CMD.LINE;

  // Totales
  d += row('Subtotal:', '$' + subtotal.toFixed(2));
  if (discount > 0) d += row('Descuento:', '-$' + discount.toFixed(2));
  d += CMD.BOLD_ON;
  d += CMD.DOUBLE_ON;
  d += row('TOTAL:', '$' + total.toFixed(2));
  d += CMD.DOUBLE_OFF;
  d += CMD.BOLD_OFF;

  // Método de pago
  if (order.paymentMethod) {
    const pmLabels = { CASH:'Efectivo', CARD_PRESENT:'Tarjeta', TRANSFER:'Transferencia', COURTESY:'Cortesía' };
    d += row('Pago:', pmLabels[order.paymentMethod] || order.paymentMethod);
  }

  // Propina sugerida
  if (config?.showTip !== false) {
    d += CMD.LINE;
    d += CMD.ALIGN_CENTER;
    d += 'Propina sugerida:\n';
    d += row('10%:', '$' + (total * 0.10).toFixed(2));
    d += row('15%:', '$' + (total * 0.15).toFixed(2));
    d += row('20%:', '$' + (total * 0.20).toFixed(2));
  }

  // Footer
  d += CMD.LINE_DOUBLE;
  d += CMD.ALIGN_CENTER;
  if (config?.footer) {
    d += CMD.BOLD_ON;
    d += config.footer + '\n';
    d += CMD.BOLD_OFF;
  } else {
    d += CMD.BOLD_ON;
    d += '¡Gracias por su visita!\n';
    d += CMD.BOLD_OFF;
  }
  d += CMD.LF + CMD.LF + CMD.LF;
  d += CMD.CUT;
  return d;
}

// ── ENRUTAMIENTO POR PRINTER GROUPS ───────────────────────────────────────
// Fuente única de ruteo (espejo del dispatcher del TPV en printer-tcp.ts):
// cada item se enruta al/los PrinterGroup de su override item-level o, si no
// tiene, al default de su categoría. Una impresora recibe un item cuando es
// miembro de alguno de esos grupos.
//
// Devuelve un Map<printerId, items[]> con los items que toca a cada impresora,
// o `null` si NINGÚN item del pedido tiene ruta declarada / nada matchea —
// señal para el fallback legacy ("cada impresora de cocina imprime todo").
async function resolveKitchenRouting(order, kitchenPrinters) {
  const items = order.items || [];
  if (items.length === 0 || kitchenPrinters.length === 0) return null;

  const catIds  = [...new Set(items.map(i => i.menuItem?.categoryId).filter(Boolean))];
  const itemIds = [...new Set(items.map(i => i.menuItemId).filter(Boolean))];
  const printerIds = kitchenPrinters.map(p => p.id);

  const [catLinks, itemLinks, memberLinks] = await Promise.all([
    catIds.length ? prisma.categoryPrinterGroup.findMany({
      where: { categoryId: { in: catIds } },
      select: { categoryId: true, printerGroupId: true },
    }) : [],
    itemIds.length ? prisma.menuItemPrinterGroup.findMany({
      where: { menuItemId: { in: itemIds } },
      select: { menuItemId: true, printerGroupId: true },
    }) : [],
    prisma.printerGroupMember.findMany({
      where: { printerId: { in: printerIds } },
      select: { printerId: true, printerGroupId: true },
    }),
  ]);

  const addTo = (map, key, val) => {
    let set = map.get(key);
    if (!set) { set = new Set(); map.set(key, set); }
    set.add(val);
  };
  const catGroups     = new Map(); // categoryId -> Set(groupId)
  const itemGroups    = new Map(); // menuItemId -> Set(groupId)
  const printerGroups = new Map(); // printerId  -> Set(groupId)
  for (const l of catLinks)    addTo(catGroups, l.categoryId, l.printerGroupId);
  for (const l of itemLinks)   addTo(itemGroups, l.menuItemId, l.printerGroupId);
  for (const l of memberLinks) addTo(printerGroups, l.printerId, l.printerGroupId);

  // Grupos efectivos de un item: override item-level gana sobre categoría.
  const routeOf = (item) => {
    const override = itemGroups.get(item.menuItemId);
    if (override && override.size > 0) return override;
    const def = catGroups.get(item.menuItem?.categoryId);
    return def && def.size > 0 ? def : null;
  };

  if (!items.some(routeOf)) return null; // ningún item enrutado → fallback

  const byPrinter = new Map(); // printerId -> items[]
  for (const item of items) {
    const groups = routeOf(item);
    if (!groups) continue; // item sin ruta se ignora cuando hay groups activos
    for (const printer of kitchenPrinters) {
      const pg = printerGroups.get(printer.id);
      if (!pg) continue;
      let match = false;
      for (const gid of groups) { if (pg.has(gid)) { match = true; break; } }
      if (!match) continue;
      const arr = byPrinter.get(printer.id) || [];
      arr.push(item);
      byPrinter.set(printer.id, arr);
    }
  }
  return byPrinter.size > 0 ? byPrinter : null;
}

// ── IMPRIMIR ORDEN (enrutada por PrinterGroups) ───────────────────────────
async function printOrderTicket(order) {
  try {
    const printerWhere = { isActive: true };
    if (order.locationId) printerWhere.locationId = order.locationId;
    const printers = await prisma.printer.findMany({ where: printerWhere });
    const config   = await prisma.ticketConfig.findFirst(
      order.locationId ? { where: { locationId: order.locationId } } : undefined
    );
    const items    = order.items || [];

    const kitchenPrinters = printers.filter(p => p.type !== 'CASHIER');
    const cashierPrinter  = printers.find(p => p.type === 'CASHIER');

    const routed = await resolveKitchenRouting(order, kitchenPrinters);

    if (routed) {
      // Cada impresora recibe SOLO los items que le enruta su(s) grupo(s).
      for (const [printerId, printerItems] of routed.entries()) {
        if (printerItems.length === 0) continue;
        const printer = kitchenPrinters.find(p => p.id === printerId);
        if (!printer) continue;
        const ticket = buildKitchenTicket(order, printerItems, printer.name);
        await printToIp(printer.ip, printer.port, ticket).catch(e =>
          console.error('Error imprimiendo en ' + printer.name + ':', e.message)
        );
      }
    } else if (items.length > 0) {
      // Fallback legacy: sin rutas declaradas, cada impresora de cocina
      // imprime todos los items (comportamiento histórico).
      for (const printer of kitchenPrinters) {
        const ticket = buildKitchenTicket(order, items, printer.name);
        await printToIp(printer.ip, printer.port, ticket).catch(e =>
          console.error('Error imprimiendo en ' + printer.name + ':', e.message)
        );
      }
    }

    // Ticket de cobro solo si es CASHIER
    if (cashierPrinter) {
      const ticket = buildCashierTicket(order, config);
      await printToIp(cashierPrinter.ip, cashierPrinter.port, ticket).catch(e =>
        console.error('Error imprimiendo ticket cobro:', e.message)
      );
    }

  } catch (e) {
    console.error('Error en printOrderTicket:', e.message);
  }
}

// ── IMPRIMIR SOLO CUENTA (sin cobro, para mostrar al cliente) ─────────────
async function printBillTicket(order) {
  try {
    const printers = await prisma.printer.findMany({ where: { isActive: true, type: 'CASHIER' } });
    const config   = await prisma.ticketConfig.findFirst();
    for (const printer of printers) {
      const ticket = buildCashierTicket(order, config);
      await printToIp(printer.ip, printer.port, ticket).catch(e =>
        console.error('Error imprimiendo cuenta:', e.message)
      );
    }
  } catch (e) {
    console.error('Error en printBillTicket:', e.message);
  }
}

// ── TEST IMPRESORA ─────────────────────────────────────────────────────────
async function printTest(ip, port, type) {
  const now = new Date().toLocaleString('es-MX');
  let d = CMD.INIT + CMD.ALIGN_CENTER;
  d += CMD.BOLD_ON + 'PRUEBA DE IMPRESION\n' + CMD.BOLD_OFF;
  d += type + '\n' + now + '\n';
  d += CMD.LINE;
  if (type === 'CASHIER') {
    d += CMD.ALIGN_LEFT;
    d += row('1x Hamburguesa', '$120.00');
    d += row('2x Refresco', '$60.00');
    d += CMD.LINE;
    d += CMD.BOLD_ON + row('TOTAL:', '$180.00') + CMD.BOLD_OFF;
  } else {
    d += CMD.DOUBLE_ON + CMD.BOLD_ON;
    d += '2x Hamburguesa\n1x Papas\n';
    d += CMD.DOUBLE_OFF + CMD.BOLD_OFF;
    d += CMD.BOLD_ON + '*** Sin cebolla ***\n' + CMD.BOLD_OFF;
  }
  d += CMD.LINE + CMD.ALIGN_CENTER + 'OK\n' + CMD.LF + CMD.LF + CMD.CUT;
  return printToIp(ip, port, d);
}


// ── IMPRIMIR ORDEN A UNA SOLA ESTACION ───────────────────────────────────
async function printOrderToStation(order, printerId) {
  try {
    const printer = await prisma.printer.findUnique({ where: { id: printerId } });
    if (!printer || !printer.isActive) return;
    const items = order.items || [];

    // Items que los PrinterGroups enrutan a ESTA impresora. Si no tiene ruta
    // declarada (o nada matchea), imprime todos — preserva el fallback
    // histórico de "estación única".
    const routed = await resolveKitchenRouting(order, [printer]);
    const routedItems = routed?.get(printer.id);
    const printerItems = routedItems && routedItems.length > 0 ? routedItems : items;

    if (printerItems.length === 0) return;
    const ticket = buildKitchenTicket(order, printerItems, printer.name);
    await printToIp(printer.ip, printer.port, ticket);
  } catch (e) {
    console.error('Error en printOrderToStation:', e.message);
  }
}

// ── IMPRIMIR SOLO LOS ITEMS DE UNA RONDA (Dine-in) ────────────────────────
// Variante de printOrderTicket que filtra por roundId antes de despachar a
// las impresoras de cocina. Útil cuando una mesa pide una segunda ronda y
// queremos que cocina sólo vea lo nuevo, no la cuenta entera otra vez.
async function printOrderRoundTicket(order, roundId) {
  if (!roundId) return printOrderTicket(order);
  const filtered = {
    ...order,
    items: (order.items || []).filter(it => it.roundId === roundId),
  };
  if (filtered.items.length === 0) return;
  return printOrderTicket(filtered);
}

// ── ABRIR CAJÓN DEL DINERO ────────────────────────────────────────────────
// Manda el comando ESC/POS drawer-kick a una impresora por IP. Safe: inicializa
// el puerto primero para evitar estados corruptos del printer.
async function kickDrawer(ip, port) {
  const payload = CMD.INIT + CMD.DRAWER_KICK;
  return printToIp(ip, port, payload, false, false);
}

// Intenta abrir el cajón conectado a la impresora de caja (CASHIER + supports
// CashDrawer = true) de una sucursal. No-op si no hay impresora apta. No
// lanza: log-and-swallow, porque un cobro no debe fallar porque el cajón
// esté desconectado.
async function kickCashDrawerForLocation(locationId) {
  if (!locationId) return { ok: false, reason: 'no_location' };
  try {
    const printer = await prisma.printer.findFirst({
      where: {
        locationId,
        isActive: true,
        type: 'CASHIER',
        supportsCashDrawer: true,
        connectionType: 'NETWORK',
        ip: { not: null },
      },
    });
    if (!printer) return { ok: false, reason: 'no_printer' };
    await kickDrawer(printer.ip, printer.port);
    return { ok: true, printerId: printer.id };
  } catch (e) {
    console.error('[printer] kickCashDrawerForLocation error:', e.message);
    return { ok: false, reason: 'error', error: e.message };
  }
}

module.exports = {
  printOrderTicket, printOrderRoundTicket, printBillTicket, printOrderToStation,
  printTest, printToIp, buildKitchenTicket, buildCashierTicket,
  kickDrawer, kickCashDrawerForLocation,
};
