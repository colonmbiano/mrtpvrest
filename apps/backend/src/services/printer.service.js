const net = require('net');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
};

function printToIp(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => { client.destroy(); reject(new Error('Timeout')); }, 5000);
    client.connect(port || 9100, ip, () => {
      client.write(Buffer.from(data, 'binary'));
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

// ── IMPRIMIR ORDEN (por estacion segun categoria) ─────────────────────────
async function printOrderTicket(order) {
  try {
    const printers = await prisma.printer.findMany({ where: { isActive: true } });
    const config   = await prisma.ticketConfig.findFirst();
    const items    = order.items || [];

    // Agrupar items por impresora segun categoria
    const kitchenPrinters = printers.filter(p => p.type !== 'CASHIER');
    const cashierPrinter  = printers.find(p => p.type === 'CASHIER');

    // Para cada impresora de cocina, filtrar items de sus categorias
    for (const printer of kitchenPrinters) {
      let printerCategories = [];
      try { printerCategories = JSON.parse(printer.categories || '[]'); } catch {}

      const printerItems = printerCategories.length > 0
        ? items.filter(item => {
            const catId = item.menuItem?.categoryId || item.categoryId;
            return printerCategories.includes(catId);
          })
        : items;

      if (printerItems.length === 0) continue;

      const ticket = buildKitchenTicket(order, printerItems, printer.name);
      await printToIp(printer.ip, printer.port, ticket).catch(e =>
        console.error('Error imprimiendo en ' + printer.name + ':', e.message)
      );
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

    let printerCategories = [];
    try { printerCategories = JSON.parse(printer.categories || '[]'); } catch {}

    const printerItems = printerCategories.length > 0
      ? items.filter(item => {
          const catId = item.menuItem?.categoryId || item.categoryId;
          return printerCategories.includes(catId);
        })
      : items;

    if (printerItems.length === 0) {
      // Si no hay items de esa categoria, imprime todos
      const ticket = buildKitchenTicket(order, items, printer.name);
      await printToIp(printer.ip, printer.port, ticket);
    } else {
      const ticket = buildKitchenTicket(order, printerItems, printer.name);
      await printToIp(printer.ip, printer.port, ticket);
    }
  } catch (e) {
    console.error('Error en printOrderToStation:', e.message);
  }
}

module.exports = { printOrderTicket, printBillTicket, printOrderToStation, printTest, printToIp, buildKitchenTicket, buildCashierTicket };
