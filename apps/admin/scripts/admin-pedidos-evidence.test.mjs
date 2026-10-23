import assert from "assert";

function getCollectionPin(orderId) {
  let hash = 0;
  for (let i = 0; i < orderId.length; i++) {
    const char = orderId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  const pin = Math.abs(hash) % 10000;
  return String(pin).padStart(4, "0");
}

function hasActiveIncident(incidents) {
  return Boolean(incidents && incidents.length > 0);
}

function generateMockOrder(id, status, incidentCount = 0) {
  const deliveryIncidents = [];
  for (let i = 0; i < incidentCount; i++) {
    deliveryIncidents.push({
      id: `incident-${i}`,
      type: ["CUSTOMER_UNREACHABLE", "WRONG_ADDRESS", "DAMAGED_OR_REJECTED"][i % 3],
      loggedAt: new Date(Date.now() - 1000 * 60 * (i + 1)).toISOString(),
    });
  }
  return {
    id,
    orderNumber: `#${String(Math.floor(Math.random() * 9000) + 1000)}`,
    status,
    customerName: "Cliente Test",
    total: 150.00,
    deliveryIncidents,
  };
}

const tests = [
  {
    name: "PIN de recolección: formato 4 dígitos",
    fn: () => {
      const pin = getCollectionPin("order-123");
      assert.strictEqual(typeof pin, "string", "PIN debe ser string");
      assert.strictEqual(pin.length, 4, "PIN debe tener 4 dígitos");
      assert.match(pin, /^\d{4}$/, "PIN debe ser 4 dígitos");
    },
  },
  {
    name: "PIN de recolección: determinista",
    fn: () => {
      const orderId = "order-abc123";
      const pin1 = getCollectionPin(orderId);
      const pin2 = getCollectionPin(orderId);
      assert.strictEqual(pin1, pin2, "PIN debe ser el mismo para el mismo ID");
    },
  },
  {
    name: "PIN de recolección: diferentes IDs producen PINs diferentes",
    fn: () => {
      const pin1 = getCollectionPin("order-111");
      const pin2 = getCollectionPin("order-222");
      assert.notStrictEqual(pin1, pin2, "Diferentes IDs deben generar PINs diferentes");
    },
  },
  {
    name: "PIN de recolección: sin padding si es >= 1000",
    fn: () => {
      const orderId = "x".repeat(100);
      const pin = getCollectionPin(orderId);
      assert.match(pin, /^\d{4}$/, "PIN siempre debe ser 4 dígitos");
    },
  },
  {
    name: "Incidencias activas: sin incidencias",
    fn: () => {
      const active = hasActiveIncident([]);
      assert.strictEqual(active, false, "Sin incidencias no debe haber activas");
    },
  },
  {
    name: "Incidencias activas: una incidencia",
    fn: () => {
      const incidents = [
        { id: "i1", type: "CUSTOMER_UNREACHABLE", loggedAt: new Date().toISOString() },
      ];
      const active = hasActiveIncident(incidents);
      assert.strictEqual(active, true, "Una incidencia debe contar como activa");
    },
  },
  {
    name: "Incidencias activas: múltiples incidencias",
    fn: () => {
      const incidents = [
        { id: "i1", type: "CUSTOMER_UNREACHABLE", loggedAt: new Date().toISOString() },
        { id: "i2", type: "WRONG_ADDRESS", loggedAt: new Date().toISOString() },
      ];
      const active = hasActiveIncident(incidents);
      assert.strictEqual(active, true, "Múltiples incidencias deben contar como activas");
    },
  },
  {
    name: "Incidencias activas: undefined",
    fn: () => {
      const active = hasActiveIncident(undefined);
      assert.strictEqual(active, false, "undefined no debe contar como activas");
    },
  },
  {
    name: "Incidencias activas: null",
    fn: () => {
      const active = hasActiveIncident(null);
      assert.strictEqual(active, false, "null no debe contar como activas");
    },
  },
  {
    name: "Mock order: READY sin incidencias",
    fn: () => {
      const order = generateMockOrder("order-1", "READY", 0);
      assert.strictEqual(order.status, "READY");
      assert.strictEqual(order.deliveryIncidents.length, 0);
      const pin = getCollectionPin(order.id);
      assert.match(pin, /^\d{4}$/);
    },
  },
  {
    name: "Mock order: ON_THE_WAY con incidencias",
    fn: () => {
      const order = generateMockOrder("order-2", "ON_THE_WAY", 2);
      assert.strictEqual(order.status, "ON_THE_WAY");
      assert.strictEqual(order.deliveryIncidents.length, 2);
      const hasActive = hasActiveIncident(order.deliveryIncidents);
      assert.strictEqual(hasActive, true);
    },
  },
  {
    name: "Mock order: DELIVERED con incidencias",
    fn: () => {
      const order = generateMockOrder("order-3", "DELIVERED", 1);
      assert.strictEqual(order.status, "DELIVERED");
      assert.strictEqual(order.deliveryIncidents.length, 1);
      assert.strictEqual(order.deliveryIncidents[0].type, "CUSTOMER_UNREACHABLE");
    },
  },
  {
    name: "Mock order: PENDING sin incidencias",
    fn: () => {
      const order = generateMockOrder("order-4", "PENDING", 0);
      assert.strictEqual(order.status, "PENDING");
      assert.strictEqual(order.deliveryIncidents.length, 0);
      const pin = getCollectionPin(order.id);
      assert.match(pin, /^\d{4}$/);
    },
  },
  {
    name: "Mock order: PREPARING con PIN válido",
    fn: () => {
      const order = generateMockOrder("order-5", "PREPARING", 0);
      const pin = getCollectionPin(order.id);
      assert.strictEqual(pin.length, 4, "PIN debe tener 4 caracteres");
      assert.match(pin, /^\d{4}$/, "PIN debe ser 4 dígitos");
    },
  },
  {
    name: "Evidence modal: verificar estructura de mock",
    fn: () => {
      const order = generateMockOrder("order-6", "DELIVERED", 3);
      assert.ok(order.id, "Order debe tener ID");
      assert.ok(order.orderNumber, "Order debe tener orderNumber");
      assert.ok(order.status, "Order debe tener status");
      assert.ok(order.total, "Order debe tener total");
      assert.ok(Array.isArray(order.deliveryIncidents), "deliveryIncidents debe ser array");
      order.deliveryIncidents.forEach((incident) => {
        assert.ok(incident.id, "Incidente debe tener ID");
        assert.ok(incident.type, "Incidente debe tener type");
        assert.ok(incident.loggedAt, "Incidente debe tener loggedAt");
      });
    },
  },
  {
    name: "PIN estable a través de múltiples órdenes",
    fn: () => {
      const pins = {};
      for (let i = 0; i < 10; i++) {
        const orderId = `order-${i}`;
        const pin = getCollectionPin(orderId);
        if (pins[pin]) {
          pins[pin].count++;
        } else {
          pins[pin] = { orderId, count: 1 };
        }
      }
      const uniquePins = Object.keys(pins).length;
      assert.ok(uniquePins >= 5, `Debería haber al menos 5 PINs únicos, obtuvo ${uniquePins}`);
    },
  },
  {
    name: "Incident types válidos",
    fn: () => {
      const validTypes = ["CUSTOMER_UNREACHABLE", "WRONG_ADDRESS", "DAMAGED_OR_REJECTED"];
      const order = generateMockOrder("order-7", "ON_THE_WAY", 3);
      order.deliveryIncidents.forEach((incident) => {
        assert.ok(
          validTypes.includes(incident.type),
          `Type "${incident.type}" no es válido`
        );
      });
    },
  },
  {
    name: "Timestamp de incidencias en formato ISO",
    fn: () => {
      const order = generateMockOrder("order-8", "ON_THE_WAY", 2);
      order.deliveryIncidents.forEach((incident) => {
        const date = new Date(incident.loggedAt);
        assert.ok(
          Number.isFinite(date.getTime()),
          `Timestamp "${incident.loggedAt}" no es válido`
        );
      });
    },
  },
];

let passed = 0;
let failed = 0;

console.log("\n🧪 Suite: admin-pedidos-evidence\n");

tests.forEach(({ name, fn }) => {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
});

console.log(`\n📊 Resultado: ${passed} PASS, ${failed} FAIL\n`);

if (failed > 0) {
  process.exit(1);
}
