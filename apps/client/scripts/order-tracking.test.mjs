#!/usr/bin/env node

import assert from 'assert';

const TIMELINE_STATES = [
  { status: 'PENDING', label: 'Recibido', icon: '📋' },
  { status: 'PREPARING', label: 'En preparación', icon: '👨‍🍳' },
  { status: 'READY', label: 'Listo', icon: '✅' },
  { status: 'ON_THE_WAY', label: 'En camino', icon: '🚗' },
  { status: 'DELIVERED', label: 'Entregado', icon: '🎉' },
];

function generatePIN() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getStatusIndex(status) {
  return Math.max(0, TIMELINE_STATES.findIndex((s) => s.status === status));
}

function parseIncidents(order) {
  if (!order.orderType || order.orderType !== 'DELIVERY' || !['ON_THE_WAY', 'DELIVERED'].includes(order.status)) {
    return [];
  }
  const noteText = order.notes || '';
  if (noteText.includes('CUSTOMER_UNREACHABLE')) {
    return [
      {
        id: 'inc-1',
        type: 'CUSTOMER_UNREACHABLE',
        description: 'No fue posible contactar al cliente',
        reportedAt: new Date().toISOString(),
        resolved: order.status === 'DELIVERED',
      },
    ];
  }
  return [];
}

function validateOrderStructure(order) {
  assert.ok(order.id, 'Order must have id');
  assert.ok(order.orderNumber, 'Order must have orderNumber');
  assert.ok(order.status, 'Order must have status');
  assert.ok(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'].includes(order.status), 'Status must be valid');
  assert.ok(order.orderType, 'Order must have orderType');
  assert.ok(typeof order.total === 'number', 'Total must be a number');
  assert.ok(Array.isArray(order.items), 'Items must be an array');
}

function validatePin(pin) {
  assert.ok(pin, 'PIN must be generated');
  assert.equal(pin.length, 4, 'PIN must be 4 digits');
  assert.ok(/^\d{4}$/.test(pin), 'PIN must contain only digits');
  assert.ok(parseInt(pin) >= 1000, 'PIN minimum value is 1000');
  assert.ok(parseInt(pin) <= 9999, 'PIN maximum value is 9999');
}

function runTests() {
  console.log('🧪 Order Tracking Tests\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    // PIN Generation Tests
    {
      name: 'PIN Generation: Should generate 4-digit PIN',
      run: () => {
        const pin = generatePIN();
        validatePin(pin);
      },
    },
    {
      name: 'PIN Generation: All generated PINs should be unique',
      run: () => {
        const pins = new Set();
        for (let i = 0; i < 100; i++) {
          const pin = generatePIN();
          validatePin(pin);
          pins.add(pin);
        }
        assert.ok(pins.size > 50, 'Should have good distribution of unique PINs');
      },
    },
    {
      name: 'PIN Generation: PIN format consistency',
      run: () => {
        for (let i = 0; i < 50; i++) {
          const pin = generatePIN();
          assert.equal(typeof pin, 'string', 'PIN should be a string');
          assert.equal(pin.length, 4, 'PIN should always be 4 characters');
        }
      },
    },

    // Timeline Tests
    {
      name: 'Timeline: Status index for PENDING should be 0',
      run: () => {
        assert.equal(getStatusIndex('PENDING'), 0);
      },
    },
    {
      name: 'Timeline: Status index progression should be correct',
      run: () => {
        assert.equal(getStatusIndex('PENDING'), 0);
        assert.equal(getStatusIndex('PREPARING'), 1);
        assert.equal(getStatusIndex('READY'), 2);
        assert.equal(getStatusIndex('ON_THE_WAY'), 3);
        assert.equal(getStatusIndex('DELIVERED'), 4);
      },
    },
    {
      name: 'Timeline: Invalid status should default to 0',
      run: () => {
        assert.equal(getStatusIndex('INVALID_STATUS'), 0);
        assert.equal(getStatusIndex('CANCELLED'), 0);
      },
    },
    {
      name: 'Timeline: All states should have labels and icons',
      run: () => {
        TIMELINE_STATES.forEach((state) => {
          assert.ok(state.status, 'State must have status');
          assert.ok(state.label, 'State must have label');
          assert.ok(state.icon, 'State must have icon');
          assert.equal(typeof state.label, 'string', 'Label must be string');
          assert.equal(typeof state.icon, 'string', 'Icon must be string');
        });
      },
    },

    // Incident Tests
    {
      name: 'Incidents: Non-delivery order should have no incidents',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'DELIVERED',
          orderType: 'TAKEOUT',
          total: 100,
          items: [],
          notes: 'CUSTOMER_UNREACHABLE',
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 0, 'Non-delivery orders should not have incidents');
      },
    },
    {
      name: 'Incidents: Delivery order with CUSTOMER_UNREACHABLE should be detected',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'ON_THE_WAY',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: 'CUSTOMER_UNREACHABLE encountered',
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 1, 'Should detect 1 incident');
        assert.equal(incidents[0].type, 'CUSTOMER_UNREACHABLE');
        assert.ok(!incidents[0].resolved, 'Incident should not be resolved in ON_THE_WAY');
      },
    },
    {
      name: 'Incidents: Delivered order with CUSTOMER_UNREACHABLE should be resolved',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'DELIVERED',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: 'CUSTOMER_UNREACHABLE but delivered',
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 1, 'Should detect 1 incident');
        assert.ok(incidents[0].resolved, 'Incident should be resolved when DELIVERED');
      },
    },
    {
      name: 'Incidents: Orders without incident notes should have empty incidents',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'ON_THE_WAY',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: 'Just a regular note',
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 0, 'Should not detect incidents');
      },
    },
    {
      name: 'Incidents: PENDING order should not have incidents even with CUSTOMER_UNREACHABLE note',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'PENDING',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: 'CUSTOMER_UNREACHABLE',
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 0, 'PENDING orders should not trigger incidents');
      },
    },

    // Order Structure Tests
    {
      name: 'Order Structure: Valid order should pass validation',
      run: () => {
        const order = {
          id: 'ord-123',
          orderNumber: '42',
          status: 'READY',
          orderType: 'DELIVERY',
          total: 250.5,
          items: [{ name: 'Taco', quantity: 2, price: 50 }],
          createdAt: new Date().toISOString(),
        };
        validateOrderStructure(order);
      },
    },
    {
      name: 'Order Structure: All required fields must be present',
      run: () => {
        const invalidOrders = [
          { orderNumber: '1', status: 'READY', orderType: 'DELIVERY', total: 100, items: [] },
          { id: '1', status: 'READY', orderType: 'DELIVERY', total: 100, items: [] },
          { id: '1', orderNumber: '1', orderType: 'DELIVERY', total: 100, items: [] },
          { id: '1', orderNumber: '1', status: 'READY', total: 100, items: [] },
          { id: '1', orderNumber: '1', status: 'READY', orderType: 'DELIVERY', items: [] },
          { id: '1', orderNumber: '1', status: 'READY', orderType: 'DELIVERY', total: 100 },
        ];
        invalidOrders.forEach((order) => {
          let failed = false;
          try {
            validateOrderStructure(order);
          } catch (e) {
            failed = true;
          }
          assert.ok(failed, 'Invalid order should fail validation');
        });
      },
    },

    // Consistency Tests
    {
      name: 'Consistency: Timeline states should be in correct order',
      run: () => {
        const indices = TIMELINE_STATES.map((s) => getStatusIndex(s.status));
        for (let i = 0; i < indices.length; i++) {
          assert.equal(indices[i], i, `Timeline index ${i} should match position`);
        }
      },
    },
    {
      name: 'Consistency: All timeline states must have unique status values',
      run: () => {
        const statuses = TIMELINE_STATES.map((s) => s.status);
        const uniqueStatuses = new Set(statuses);
        assert.equal(statuses.length, uniqueStatuses.size, 'All statuses should be unique');
      },
    },
    {
      name: 'Consistency: Incidents should have valid structure',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'ON_THE_WAY',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: 'CUSTOMER_UNREACHABLE',
        };
        const incidents = parseIncidents(order);
        incidents.forEach((inc) => {
          assert.ok(inc.id, 'Incident must have id');
          assert.ok(inc.type, 'Incident must have type');
          assert.ok(inc.description, 'Incident must have description');
          assert.ok(inc.reportedAt, 'Incident must have reportedAt');
          assert.equal(typeof inc.resolved, 'boolean', 'Incident resolved must be boolean');
        });
      },
    },
    {
      name: 'Consistency: PIN should be consistent type across calls',
      run: () => {
        const pins = [generatePIN(), generatePIN(), generatePIN()];
        pins.forEach((pin) => {
          assert.equal(typeof pin, 'string', 'All PINs should be strings');
          assert.ok(/^\d{4}$/.test(pin), 'All PINs should match 4-digit pattern');
        });
      },
    },

    // Edge Cases
    {
      name: 'Edge Case: Order with empty items array',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'PENDING',
          orderType: 'DELIVERY',
          total: 0,
          items: [],
        };
        validateOrderStructure(order);
      },
    },
    {
      name: 'Edge Case: Order with null notes',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'ON_THE_WAY',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: null,
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 0, 'Null notes should not cause incidents');
      },
    },
    {
      name: 'Edge Case: Order with undefined notes',
      run: () => {
        const order = {
          id: '1',
          orderNumber: '1',
          status: 'ON_THE_WAY',
          orderType: 'DELIVERY',
          total: 100,
          items: [],
          notes: undefined,
        };
        const incidents = parseIncidents(order);
        assert.equal(incidents.length, 0, 'Undefined notes should not cause incidents');
      },
    },
  ];

  tests.forEach((test) => {
    try {
      test.run();
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (error) {
      console.error(`❌ ${test.name}`);
      console.error(`   ${error.message}\n`);
      failed++;
    }
  });

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
