// sales-import.routes.js
//
// Importa histórico de ventas desde Excel/CSV. Crea Orders + OrderItems
// con createdAt = fecha del archivo (no `now()`) para que reports
// históricos cuadren con tu data anterior al sistema.
//
// Mapeo de columnas automático (case-insensitive):
//   fecha / date / fecha_venta              → occurredAt (DateTime)
//   producto / plato / item / menu_item     → menuItem.name (lookup por name)
//   cantidad / qty / quantity / unidades    → quantity
//   precio / unit_price / precio_unitario   → price unitario
//   total / subtotal / importe              → si no hay unit_price, total/qty = unit_price
//   metodo / payment / forma_pago           → paymentMethod (mapeado)
//   cliente / customer / nombre_cliente     → customerName
//   mesa / table / mesa_numero              → tableName (no FK, libre)
//   orden / order_id / folio                → agrupa items de un mismo "ticket"
//                                             (si está, varios rows → un Order)
//
// Si no hay columna "orden", se crea UN Order por fila.
// Si una fila falla (sin MenuItem que matchee, fecha inválida), se reporta
// en `warnings[]` pero NO bloquea el resto.

const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const csv = require('csv-parser');
const { Readable } = require('stream');
const { prisma } = require('@mrtpvrest/database');
const { authenticate, requireAdmin, requireTenantAccess } = require('../middleware/auth.middleware');
const router = express.Router();
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

const COL_PATTERNS = {
  date:        /^(fecha|date|fecha[_\s]?venta|created_?at)$/i,
  menuItem:    /^(producto|plato|item|menu[_\s]?item|nombre|descripcion|description)$/i,
  qty:         /^(cantidad|qty|quantity|unidades|cant)$/i,
  unitPrice:   /^(precio[_\s]?unit|unit[_\s]?price|precio[_\s]?unitario)$/i,
  total:       /^(total|subtotal|importe|monto)$/i,
  price:       /^(precio|price)$/i,
  paymentMethod:/^(metodo|payment|forma[_\s]?pago|payment[_\s]?method)$/i,
  customer:    /^(cliente|customer|nombre[_\s]?cliente|customer[_\s]?name)$/i,
  table:       /^(mesa|table|mesa[_\s]?numero|table[_\s]?name)$/i,
  orderRef:    /^(orden|order|order[_\s]?id|folio|ticket)$/i,
};

const PAYMENT_MAP = {
  EFECTIVO: 'CASH', CASH: 'CASH',
  TARJETA: 'CARD', CARD: 'CARD', CREDITO: 'CARD',
  DEBITO: 'CARD',
  TRANSFER: 'TRANSFER', TRANSFERENCIA: 'TRANSFER',
  RAPPI: 'CARD', DIDI: 'CARD', UBER: 'CARD',
};

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function findColumn(keys, pattern) {
  return keys.find((k) => pattern.test(String(k).trim()));
}

// Parsea el archivo y devuelve filas crudas. Reusa logica del scan-inventory.
async function parseFile(file) {
  let rawData = [];
  const isXlsx = file.mimetype.includes('spreadsheetml') || file.mimetype.includes('excel') ||
                 file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
  const isCsv = file.mimetype.includes('csv') || file.originalname.endsWith('.csv');

  if (isXlsx) {
    const wb = xlsx.read(file.buffer, { type: 'buffer', cellDates: true });
    // Buscar primera hoja con headers detectables
    let pickedWS = null;
    for (const name of wb.SheetNames) {
      const ws = wb.Sheets[name];
      const matrix = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
      // Buscar fila con header de fecha + producto
      let headerRow = -1;
      for (let r = 0; r < Math.min(matrix.length, 30); r++) {
        const cells = (matrix[r] || []).map((c) => String(c || '').trim());
        const hasDate = cells.some((c) => COL_PATTERNS.date.test(c));
        const hasItem = cells.some((c) => COL_PATTERNS.menuItem.test(c));
        if (hasDate && hasItem) { headerRow = r; break; }
      }
      if (headerRow >= 0) {
        rawData = xlsx.utils.sheet_to_json(ws, { defval: '', range: headerRow });
        pickedWS = ws;
        break;
      }
    }
    if (!pickedWS) {
      rawData = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    }
  } else if (isCsv) {
    rawData = await new Promise((resolve, reject) => {
      const results = [];
      Readable.from(file.buffer)
        .pipe(csv())
        .on('data', (d) => results.push(d))
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } else {
    throw new Error('Formato no soportado (acepto .xlsx/.xls/.csv)');
  }

  return rawData;
}

// POST /api/sales/import — recibe archivo y lo procesa.
// Si query `?dryRun=1`, solo devuelve preview sin crear nada.
router.post('/import', authenticate, requireTenantAccess, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const restaurantId = req.restaurantId || req.user?.restaurantId;
    const locationId = req.headers['x-location-id'] || req.query.locationId || req.user?.locationId;
    if (!restaurantId) return res.status(400).json({ error: 'Restaurante no identificado' });
    if (!locationId)   return res.status(400).json({ error: 'Sucursal no identificada' });
    if (!req.file)     return res.status(400).json({ error: 'Falta archivo (campo "file")' });

    const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';

    const rawData = await parseFile(req.file);
    if (rawData.length === 0) return res.status(400).json({ error: 'Archivo vacío o sin headers detectables' });

    // Detectar columnas
    const keys = Object.keys(rawData[0] || {});
    const cols = {
      date:          findColumn(keys, COL_PATTERNS.date),
      menuItem:      findColumn(keys, COL_PATTERNS.menuItem),
      qty:           findColumn(keys, COL_PATTERNS.qty),
      unitPrice:     findColumn(keys, COL_PATTERNS.unitPrice),
      total:         findColumn(keys, COL_PATTERNS.total),
      price:         findColumn(keys, COL_PATTERNS.price),
      paymentMethod: findColumn(keys, COL_PATTERNS.paymentMethod),
      customer:      findColumn(keys, COL_PATTERNS.customer),
      table:         findColumn(keys, COL_PATTERNS.table),
      orderRef:      findColumn(keys, COL_PATTERNS.orderRef),
    };

    if (!cols.date || !cols.menuItem) {
      return res.status(400).json({
        error: `Necesito al menos columna de FECHA y PRODUCTO. Detecté: ${JSON.stringify(cols)}`,
        availableColumns: keys,
      });
    }

    // Pre-cargar MenuItems del restaurant para lookup por nombre
    const menuItems = await prisma.menuItem.findMany({
      where: { restaurantId },
      select: { id: true, name: true, price: true },
    });
    const menuByName = new Map(menuItems.map((m) => [normalize(m.name), m]));

    // Procesar filas
    const warnings = [];
    const ordersMap = new Map(); // orderRef → { items, fecha, paymentMethod, customer, table }
    let rowIdx = 0;
    for (const row of rawData) {
      rowIdx++;
      const itemName = String(row[cols.menuItem] || '').trim();
      if (!itemName) { warnings.push(`Fila ${rowIdx}: sin producto, saltada`); continue; }

      const matched = menuByName.get(normalize(itemName));
      if (!matched) { warnings.push(`Fila ${rowIdx}: "${itemName}" no existe en el menú, saltada`); continue; }

      const dateRaw = row[cols.date];
      const date = dateRaw instanceof Date ? dateRaw : new Date(dateRaw);
      if (!date || isNaN(date.getTime())) { warnings.push(`Fila ${rowIdx}: fecha inválida (${dateRaw}), saltada`); continue; }

      const qty = num(row[cols.qty]) || 1;
      let unitPrice = cols.unitPrice ? num(row[cols.unitPrice]) : null;
      const total = cols.total ? num(row[cols.total]) : null;
      if (unitPrice == null && total != null && qty > 0) unitPrice = total / qty;
      if (unitPrice == null && cols.price) unitPrice = num(row[cols.price]);
      if (unitPrice == null) unitPrice = matched.price; // fallback a precio actual

      const paymentRaw = cols.paymentMethod ? String(row[cols.paymentMethod] || '').toUpperCase().trim() : '';
      const paymentMethod = PAYMENT_MAP[paymentRaw] || 'CASH';
      const customer = cols.customer ? String(row[cols.customer] || '').trim() || null : null;
      const tableName = cols.table ? String(row[cols.table] || '').trim() || null : null;

      // Agrupar por orderRef si existe; sino, una orden por fila.
      const orderKey = cols.orderRef
        ? String(row[cols.orderRef] || '').trim() || `_row${rowIdx}`
        : `_row${rowIdx}`;

      if (!ordersMap.has(orderKey)) {
        ordersMap.set(orderKey, {
          orderRef: orderKey.startsWith('_row') ? null : orderKey,
          date, paymentMethod, customer, tableName, items: [],
        });
      }
      const o = ordersMap.get(orderKey);
      o.items.push({
        menuItemId: matched.id,
        name: matched.name,
        price: unitPrice,
        quantity: Math.round(qty),
        subtotal: unitPrice * qty,
      });
    }

    const orderCount = ordersMap.size;
    const itemCount = [...ordersMap.values()].reduce((s, o) => s + o.items.length, 0);

    if (dryRun) {
      return res.json({
        dryRun: true,
        detectedColumns: cols,
        rowsRead: rawData.length,
        ordersToCreate: orderCount,
        itemsToCreate: itemCount,
        warnings,
        sample: [...ordersMap.values()].slice(0, 5),
      });
    }

    // Crear orders en lotes pequeños (evita timeout)
    let createdOrders = 0;
    let createdItems = 0;
    for (const o of ordersMap.values()) {
      const subtotal = o.items.reduce((s, i) => s + i.subtotal, 0);
      try {
        await prisma.order.create({
          data: {
            restaurantId,
            locationId,
            orderNumber: o.orderRef || `HIST-${Date.now()}-${createdOrders}`,
            orderType: o.tableName ? 'DINE_IN' : 'TAKEOUT',
            status: 'DELIVERED',
            paymentMethod: o.paymentMethod,
            paymentStatus: 'PAID',
            customerName: o.customer,
            tableNumber: o.tableName,
            subtotal, total: subtotal,
            createdAt: o.date,
            updatedAt: o.date,
            items: {
              create: o.items.map((it) => ({
                menuItemId: it.menuItemId,
                name: it.name,
                price: it.price,
                quantity: it.quantity,
                subtotal: it.subtotal,
              })),
            },
          },
        });
        createdOrders++;
        createdItems += o.items.length;
      } catch (e) {
        warnings.push(`Order ${o.orderRef || 'fila-única'}: ${e.message.split('\n')[0]}`);
      }
    }

    res.json({
      ok: true,
      detectedColumns: cols,
      rowsRead: rawData.length,
      ordersCreated: createdOrders,
      itemsCreated: createdItems,
      warnings,
    });
  } catch (e) {
    console.error('POST /api/sales/import:', e);
    res.status(500).json({ error: e.message });
  }
});

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = router;
