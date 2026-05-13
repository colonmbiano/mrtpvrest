const fs = require('fs');
const path = require('path');

/**
 * CONFIGURACIÓN DE LA SIMULACIÓN MULTI-USUARIO
 */
const CONFIG = {
  API_URL: process.env.API_URL || 'http://localhost:3001/api',
  RESTAURANT_ID: 'cmop06al30005snbd74adrqu4', // Master burguers
  LOCATION_ID: 'cmop06au40008snbdbb3sq00t',     // Principal
  CSV_FILE: 'receipts-by-item-2026-05-08-2026-05-08.csv',
  DELAY_MS: 3000, 
  
  PINS: {
    ADMIN: '1228',
    DELIVERY: '1234',
    MESERO: '1112',
    CAJERO: '1113'
  }
};

const SESSIONS = {}; 
let menuMapping = {};
let tables = [];
let drivers = [];

async function apiCall(endpoint, method = 'GET', body = null, pin = CONFIG.PINS.ADMIN) {
  const headers = {
    'Content-Type': 'application/json',
    'x-location-id': CONFIG.LOCATION_ID,
    'x-restaurant-id': CONFIG.RESTAURANT_ID,
  };
  if (SESSIONS[pin]) headers['Authorization'] = `Bearer ${SESSIONS[pin].token}`;

  const res = await fetch(`${CONFIG.API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`API Error [${method} ${endpoint}]: ${err.error || JSON.stringify(err)}`);
  }
  return res.json();
}

async function setupSessions() {
  console.log('🔑 Iniciando sesiones para todos los roles...');
  for (const role in CONFIG.PINS) {
    const pin = CONFIG.PINS[role];
    try {
      const data = await apiCall('/employees/login', 'POST', { pin }, null);
      SESSIONS[pin] = { token: data.token, employeeId: data.employee.id, name: data.employee.name };
      console.log(`✅ ${role} conectado: ${data.employee.name}`);
    } catch (e) {
      console.warn(`⚠️ No se pudo conectar el rol ${role} (PIN ${pin}): ${e.message}`);
    }
  }
}

async function loadContext() {
  console.log('📖 Cargando contexto del restaurante...');
  const items = await apiCall('/menu/items');
  items.forEach(i => menuMapping[i.name.toLowerCase().trim()] = i.id);
  
  try {
    const zones = await apiCall('/tables');
    tables = Array.isArray(zones) ? (zones[0]?.tables || zones) : [];
  } catch (e) { console.warn('⚠️ No se cargaron mesas'); }

  try {
    drivers = await apiCall('/delivery');
  } catch (e) { console.warn('⚠️ No se cargaron repartidores'); }

  console.log(`✅ Contexto listo: ${items.length} productos, ${tables.length} mesas, ${drivers.length} repartidores.`);
}

function parseCSV(content) {
  const splitLine = (l) => {
    const r = []; let c = '', q = false;
    for (const char of l) {
      if (char === '"') q = !q;
      else if (char === ',' && !q) { r.push(c); c = ''; }
      else c += char;
    }
    r.push(c); return r;
  };
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  const headers = splitLine(lines[0]);
  return lines.slice(1).map(l => {
    const v = splitLine(l);
    const o = {};
    headers.forEach((h, i) => o[h.trim()] = v[i] ? v[i].trim() : '');
    return o;
  });
}

async function run() {
  console.log('🚀 INICIANDO SIMULACIÓN DE FLUJO COMPLETO (MULTI-USUARIO)');
  console.log('========================================================');

  try {
    await setupSessions();
    await loadContext();

    const filePath = path.join(process.cwd(), CONFIG.CSV_FILE);
    const rows = parseCSV(fs.readFileSync(filePath, 'utf-8'));
    
    const orders = {};
    rows.forEach(row => {
      const num = row['Número de recibo'];
      if (!num) return;
      if (!orders[num]) {
        orders[num] = {
          orderType: row['Tipo de pedido'] === 'Comer dentro' ? 'DINE_IN' : 'DELIVERY',
          items: [],
          notes: row['Comentario'] || '',
          total: 0
        };
      }
      
      const itemArticulo = row['Artículo'].toLowerCase().trim();
      const itemVariante = row['Variante'] ? row['Variante'].toLowerCase().trim() : '';
      
      // Mapeo flexible
      let id = menuMapping[`${itemArticulo} ${itemVariante}`.trim()];
      if (!id) id = menuMapping[itemArticulo];
      if (!id) id = menuMapping[itemVariante];

      if (id) {
        const qty = parseFloat(row['Cantidad']);
        const net = parseFloat(row['Ventas netas']);
        orders[num].items.push({ menuItemId: id, quantity: qty, price: qty > 0 ? net / qty : 0 });
        orders[num].total += net;
      }
    });

    const orderNums = Object.keys(orders);
    console.log(`\n📦 Procesando ${orderNums.length} pedidos históricos...\n`);

    for (const num of orderNums) {
      const data = orders[num];
      if (data.items.length === 0) continue;

      const isDineIn = data.orderType === 'DINE_IN';
      const actorPin = isDineIn ? CONFIG.PINS.MESERO : CONFIG.PINS.CAJERO;
      const actorName = SESSIONS[actorPin]?.name || 'Desconocido';

      console.log(`\n--- [Pedido ${num}] ---`);
      console.log(`👤 ${isDineIn ? 'MESERO' : 'CAJERO'} (${actorName}) tomando pedido ${data.orderType}...`);

      try {
        const payload = {
          items: data.items,
          orderType: data.orderType,
          notes: data.notes,
          subtotal: data.total,
          total: data.total,
          paymentMethod: 'PENDING',
          status: isDineIn ? 'OPEN' : 'CONFIRMED',
        };

        if (isDineIn && tables.length > 0) {
          const randomTable = tables[Math.floor(Math.random() * tables.length)];
          payload.tableId = randomTable.id;
          console.log(`🪑 Mesa: ${randomTable.number || randomTable.name}`);
        }

        const order = await apiCall('/orders/tpv', 'POST', payload, actorPin);
        console.log(`✅ Pedido creado: ${order.id}`);

        if (!isDineIn && drivers.length > 0) {
          const driver = drivers.find(d => d.pin === CONFIG.PINS.DELIVERY) || drivers[0];
          console.log(`🛵 CAJERO asignando repartidor: ${driver.name}...`);
          
          await apiCall('/delivery/assign', 'PUT', { orderId: order.id, driverId: driver.id }, CONFIG.PINS.CAJERO);
          console.log(`✅ Estado: EN CAMINO`);

          await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));

          console.log(`📱 REPARTIDOR (${driver.name}) confirmando entrega...`);
          await apiCall(`/delivery/${driver.id}/orders/${order.id}/status`, 'PUT', { 
            status: 'DELIVERED', 
            paymentMethod: 'CASH' 
          }, CONFIG.PINS.DELIVERY);
          console.log(`🏁 Pedido ENTREGADO.`);
        }
      } catch (e) {
        console.error(`❌ Error en pedido ${num}: ${e.message}`);
      }

      await new Promise(r => setTimeout(r, CONFIG.DELAY_MS));
    }

    console.log('\n✨ Simulación terminada.');

  } catch (error) {
    console.error(`\n💥 ERROR: ${error.message}`);
  }
}

run();
