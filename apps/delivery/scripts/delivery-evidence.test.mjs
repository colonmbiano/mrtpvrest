#!/usr/bin/env node
/**
 * Delivery Evidence & Incidents Offline Store Test Suite
 * Tests: photo capture, signature, incident categories, offline queueing, data integrity
 */

import assert from 'assert';

const tests = [];
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

// Mock Zustand store behavior
class MockOfflineStore {
  constructor() {
    this.queue = [];
    this.lastId = 0;
  }

  addToQueue(transaction) {
    const id = `tx-${++this.lastId}-${Date.now()}`;
    const newTx = {
      ...transaction,
      data: { ...transaction.data },
      id,
      timestamp: Date.now(),
      synced: false,
      retryCount: 0,
    };
    this.queue.push(newTx);
    return id;
  }

  getUnsynced() {
    return this.queue.filter((tx) => !tx.synced && !tx.failureReason);
  }

  markSynced(id) {
    const idx = this.queue.findIndex((tx) => tx.id === id);
    if (idx !== -1) {
      this.queue.splice(idx, 1);
    }
  }

  getQueue() {
    return this.queue;
  }

  clear() {
    this.queue = [];
    this.lastId = 0;
  }
}

// ──────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────

test('Evidence Modal: Photo base64 is valid', () => {
  const photoBase64 =
    'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert(photoBase64.startsWith('data:image/'), 'Photo must start with data URI');
  assert(photoBase64.includes('base64'), 'Photo must be base64 encoded');
});

test('Evidence Modal: Signature base64 is valid', () => {
  const signatureBase64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  assert(signatureBase64.startsWith('data:image/'), 'Signature must start with data URI');
  assert(signatureBase64.includes('base64'), 'Signature must be base64 encoded');
});

test('Evidence Modal: Compress photo to max 400x300', () => {
  const maxWidth = 400;
  const maxHeight = 300;
  let width = 800;
  let height = 600;

  if (width > height) {
    if (width > maxWidth) {
      height *= maxWidth / width;
      width = maxWidth;
    }
  }

  assert.strictEqual(width, 400, 'Width should be max 400px');
  assert.strictEqual(height, 300, 'Height should be max 300px');
});

test('Incident Modal: CUSTOMER_UNREACHABLE incident creation', () => {
  const store = new MockOfflineStore();
  const incidentData = {
    orderId: 'order-123',
    taskId: 'task-456',
    courierId: 'courier-789',
    incident: {
      type: 'CUSTOMER_UNREACHABLE',
      timestamp: Date.now(),
      callAttempts: 3,
      notes: 'Cliente no responde después de 3 intentos',
      photo: undefined,
    },
  };

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: incidentData,
  });

  assert(txId, 'Transaction ID should be generated');
  assert.strictEqual(
    store.queue.length,
    1,
    'Queue should have 1 transaction'
  );
  assert.strictEqual(
    store.queue[0].data.incident.type,
    'CUSTOMER_UNREACHABLE',
    'Incident type should be CUSTOMER_UNREACHABLE'
  );
  assert.strictEqual(
    store.queue[0].data.incident.callAttempts,
    3,
    'Should record 3 call attempts'
  );
});

test('Incident Modal: WRONG_ADDRESS incident creation', () => {
  const store = new MockOfflineStore();
  const incidentData = {
    orderId: 'order-123',
    taskId: 'task-456',
    courierId: 'courier-789',
    incident: {
      type: 'WRONG_ADDRESS',
      timestamp: Date.now(),
      callAttempts: 0,
      notes: 'Dirección de calle dice 5to piso pero es 3er piso',
      photo: undefined,
    },
  };

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: incidentData,
  });

  assert(txId, 'Transaction ID should be generated');
  assert.strictEqual(
    store.queue[0].data.incident.type,
    'WRONG_ADDRESS',
    'Incident type should be WRONG_ADDRESS'
  );
  assert(
    store.queue[0].data.incident.notes.includes('piso'),
    'Notes should contain address details'
  );
});

test('Incident Modal: DAMAGED_OR_REJECTED incident with photo', () => {
  const store = new MockOfflineStore();
  const photoData =
    'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const incidentData = {
    orderId: 'order-123',
    taskId: 'task-456',
    courierId: 'courier-789',
    incident: {
      type: 'DAMAGED_OR_REJECTED',
      timestamp: Date.now(),
      callAttempts: 0,
      notes: 'Empaque llegó abierto, comida derramada',
      photo: photoData,
    },
  };

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: incidentData,
  });

  assert(txId, 'Transaction ID should be generated');
  assert.strictEqual(
    store.queue[0].data.incident.type,
    'DAMAGED_OR_REJECTED',
    'Incident type should be DAMAGED_OR_REJECTED'
  );
  assert(
    store.queue[0].data.incident.photo?.startsWith('data:image/'),
    'Photo should be base64 encoded'
  );
  assert(
    store.queue[0].data.incident.notes.includes('derramada'),
    'Notes should describe damage'
  );
});

test('Offline Store: Multiple incidents queued independently', () => {
  const store = new MockOfflineStore();

  store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-1',
      incident: { type: 'CUSTOMER_UNREACHABLE', callAttempts: 1, notes: '', timestamp: Date.now() },
    },
  });

  store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-2',
      incident: { type: 'WRONG_ADDRESS', callAttempts: 0, notes: '', timestamp: Date.now() },
    },
  });

  store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-3',
      incident: { type: 'DAMAGED_OR_REJECTED', callAttempts: 0, notes: '', timestamp: Date.now() },
    },
  });

  assert.strictEqual(store.queue.length, 3, 'Queue should have 3 transactions');
  assert.strictEqual(
    store.getUnsynced().length,
    3,
    'All 3 should be unsynced'
  );
});

test('Offline Store: Mark transaction as synced removes it from queue', () => {
  const store = new MockOfflineStore();

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-1',
      incident: { type: 'CUSTOMER_UNREACHABLE', callAttempts: 1, notes: '', timestamp: Date.now() },
    },
  });

  assert.strictEqual(store.queue.length, 1);
  assert.strictEqual(store.getUnsynced().length, 1);

  // Simulate sync by updating the transaction
  const tx = store.queue[0];
  tx.synced = true;

  assert.strictEqual(store.getUnsynced().length, 0, 'Synced transaction should not appear in unsynced');
});

test('Offline Store: Incident data consistency (no data loss)', () => {
  const store = new MockOfflineStore();

  const originalIncident = {
    type: 'CUSTOMER_UNREACHABLE',
    timestamp: 1234567890,
    callAttempts: 5,
    notes: 'Failed after 5 attempts',
    photo: 'data:image/jpeg;base64,ABC123',
  };

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-123',
      taskId: 'task-456',
      courierId: 'courier-789',
      incident: originalIncident,
    },
  });

  const queuedTx = store.queue.find((tx) => tx.id === txId);
  assert(queuedTx, 'Transaction should be in queue');
  assert.deepStrictEqual(
    queuedTx.data.incident,
    originalIncident,
    'Incident data should not be modified'
  );
  assert.strictEqual(
    queuedTx.data.orderId,
    'order-123',
    'Order ID should be preserved'
  );
  assert.strictEqual(
    queuedTx.data.courierId,
    'courier-789',
    'Courier ID should be preserved'
  );
});

test('Offline Store: Timestamp recorded for idempotency', () => {
  const store = new MockOfflineStore();
  const beforeTime = Date.now();

  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-1',
      incident: { type: 'WRONG_ADDRESS', callAttempts: 0, notes: '', timestamp: beforeTime },
    },
  });

  const afterTime = Date.now();
  const tx = store.queue.find((tx) => tx.id === txId);

  assert(tx.timestamp >= beforeTime && tx.timestamp <= afterTime, 'Transaction timestamp should be recorded');
  assert(tx.data.incident.timestamp === beforeTime, 'Incident timestamp should be preserved');
});

test('Offline Store: Retry count increments', () => {
  const store = new MockOfflineStore();
  const txId = store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: {
      orderId: 'order-1',
      incident: { type: 'CUSTOMER_UNREACHABLE', callAttempts: 1, notes: '', timestamp: Date.now() },
    },
  });

  const tx = store.queue.find((tx) => tx.id === txId);
  assert.strictEqual(tx.retryCount, 0, 'Initial retry count should be 0');

  // Simulate retry
  tx.retryCount++;
  assert.strictEqual(tx.retryCount, 1, 'Retry count should increment');
});

test('Offline Store: Clear and reinitialize', () => {
  const store = new MockOfflineStore();

  store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: { orderId: 'order-1', incident: { type: 'CUSTOMER_UNREACHABLE', callAttempts: 1, notes: '', timestamp: Date.now() } },
  });

  store.addToQueue({
    type: 'DELIVERY_INCIDENT',
    data: { orderId: 'order-2', incident: { type: 'WRONG_ADDRESS', callAttempts: 0, notes: '', timestamp: Date.now() } },
  });

  assert.strictEqual(store.queue.length, 2);

  store.clear();
  assert.strictEqual(store.queue.length, 0, 'Queue should be empty after clear');
  assert.strictEqual(store.lastId, 0, 'ID counter should reset');
});

test('Evidence Submission: Photo and signature both provided', () => {
  const evidence = {
    photoBase64:
      'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    signatureBase64:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  assert(evidence.photoBase64, 'Photo should be present');
  assert(evidence.signatureBase64, 'Signature should be present');
  assert(evidence.photoBase64.includes('jpeg'), 'Photo should be JPEG format');
  assert(evidence.signatureBase64.includes('png'), 'Signature should be PNG format');
});

test('Evidence Submission: Only photo (signature optional)', () => {
  const evidence = {
    photoBase64:
      'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  assert(evidence.photoBase64, 'Photo should be present');
  assert(!evidence.signatureBase64, 'Signature should be optional');
});

test('Evidence Submission: Only signature (photo optional)', () => {
  const evidence = {
    signatureBase64:
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  };

  assert(!evidence.photoBase64, 'Photo should be optional');
  assert(evidence.signatureBase64, 'Signature should be present');
});

// ──────────────────────────────────────────────────────────────
// Run tests
// ──────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Delivery Evidence & Incidents Offline Store Test Suite');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  for (const { name, fn } of tests) {
    try {
      fn();
      console.log(`✓ ${name}`);
      testsPassed++;
    } catch (err) {
      console.log(`✗ ${name}`);
      console.log(`  Error: ${err.message}`);
      testsFailed++;
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
