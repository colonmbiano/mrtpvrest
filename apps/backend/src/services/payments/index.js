// apps/backend/src/services/payments/index.js
// Agnostic payment-terminal dispatcher. v1 only has the 'stub' driver.

const stub = require('./drivers/stub');

const DRIVERS = { stub };

async function charge(providerName, payload) {
  const driver = DRIVERS[providerName];
  if (!driver) throw new Error(`Payment driver '${providerName}' not registered`);
  return driver.charge(payload);
}

module.exports = { charge };
