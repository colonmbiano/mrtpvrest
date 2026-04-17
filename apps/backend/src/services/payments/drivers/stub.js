// apps/backend/src/services/payments/drivers/stub.js
// Stub driver: waits 3s and always succeeds. Replace with real SDK later.

async function charge({ terminalId, amount, currency, orderId, orderNumber }) {
  await new Promise((r) => setTimeout(r, 3000));
  return {
    success: true,
    transactionId: `STUB-${Date.now()}`,
    terminalId,
    amount,
    currency,
    authorizationCode: 'STUB000000',
    processedAt: new Date().toISOString(),
    provider: 'stub',
    orderId,
    orderNumber,
  };
}

module.exports = { charge };
