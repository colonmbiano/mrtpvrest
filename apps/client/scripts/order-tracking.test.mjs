#!/usr/bin/env node

import assert from 'assert';
import { incidentViews } from '../src/lib/orderIncidents.ts';
import { readFileSync } from 'node:fs';

const TIMELINE_STATES = [
  { status: 'PENDING', label: 'Recibido', icon: '📋' },
  { status: 'PREPARING', label: 'En preparación', icon: '👨‍🍳' },
  { status: 'READY', label: 'Listo', icon: '✅' },
  { status: 'ON_THE_WAY', label: 'En camino', icon: '🚗' },
  { status: 'DELIVERED', label: 'Entregado', icon: '🎉' },
];

function getStatusIndex(status) {
  return Math.max(0, TIMELINE_STATES.findIndex((s) => s.status === status));
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

function runTests() {
  console.log('🧪 Order Tracking Tests\n');

  let passed = 0;
  let failed = 0;

  const tests = [
    {
      name: 'PIN: the my-orders tracking modal never invents a delivery PIN',
      run: () => {
        // Store-own orders have no server PIN; marketplace orders show the real one in
        // MarketplaceTrackingModal. A random code here would be unverifiable by the courier.
        const source = readFileSync(new URL('../src/components/OrderTrackingModal.tsx', import.meta.url), 'utf8');
        assert.ok(!/Math.random|crypto.getRandomValues/.test(source), 'No random codes in the tracking modal');
        // Rendered JSX text only (comments may explain why there is no PIN).
        assert.ok(!/>s*PIN de entregas*</.test(source) && !source.includes('Muéstrale este código'), 'No delivery PIN card in the tracking modal');
      },
    },
    // PIN Generation Tests

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
      name: 'Incidents: persisted incidents are shown only on delivery orders',
      run: () => {
        const incidents = [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt: '2026-10-23T19:05:00Z', callAttempts: 3 }];
        assert.equal(incidentViews({ orderType: 'TAKEOUT', status: 'READY', incidents }).length, 0);
        assert.equal(incidentViews({ orderType: 'DELIVERY', status: 'ON_THE_WAY' }).length, 0);
        assert.equal(incidentViews({ orderType: 'DELIVERY', status: 'ON_THE_WAY', incidents: null }).length, 0);
        assert.equal(incidentViews({ orderType: 'DELIVERY', status: 'ON_THE_WAY', incidents: [] }).length, 0);
      },
    },
    {
      name: 'Incidents: customer unreachable uses call attempts, time and pending state',
      run: () => {
        const [view] = incidentViews({ orderType: 'DELIVERY', status: 'ON_THE_WAY',
          incidents: [{ id: 'i1', type: 'CUSTOMER_UNREACHABLE', occurredAt: '2026-10-23T19:05:00Z', callAttempts: 3 }] },
          { timeZone: 'America/Mexico_City' });
        assert.equal(view.id, 'i1');
        assert.equal(view.title, 'El repartidor no pudo contactarte');
        assert.equal(view.detail, 'Intentó llamarte 3 veces. Revisa tu teléfono.');
        assert.equal(view.time, '01:05 p.m.'); // mismo formato es-MX que la línea de tiempo del modal
        assert.equal(view.resolved, false);
        const [one] = incidentViews({ orderType: 'DELIVERY', status: 'ON_THE_WAY',
          incidents: [{ id: 'i2', type: 'CUSTOMER_UNREACHABLE', occurredAt: '2026-10-23T19:05:00Z', callAttempts: 1 }] });
        assert.equal(one.detail, 'Intentó llamarte 1 vez. Revisa tu teléfono.');
      },
    },
    {
      name: 'Incidents: every backend type and unknown types map to fixed copy, never free text',
      run: () => {
        const at = '2026-10-23T19:05:00Z';
        const views = incidentViews({ orderType: 'DELIVERY', status: 'DELIVERED', incidents: [
          { id: 'a', type: 'WRONG_ADDRESS', occurredAt: at, callAttempts: 0 },
          { id: 'b', type: 'DAMAGED_OR_REJECTED', occurredAt: at, callAttempts: 0 },
          { id: 'c', type: 'SOMETHING_NEW', occurredAt: 'no-es-fecha', callAttempts: 0 },
        ] });
        assert.deepEqual(views.map(v => v.title), ['Hay un problema con la dirección',
          'Hubo un problema con tu pedido', 'El repartidor reportó un problema']);
        assert.ok(views.every(v => v.resolved), 'Delivered orders mark incidents as resolved');
        assert.equal(views[2].time, null, 'Invalid dates do not render a time');
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
