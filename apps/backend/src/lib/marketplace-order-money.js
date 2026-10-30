'use strict';

// Integer cents at the boundary. Reject precision loss instead of silently repricing a basket.
const MAX_CENTS = 100000000;
function cents(value) {
  const text = ['number', 'string'].includes(typeof value) || (value && typeof value.toFixed === 'function') ? String(value) : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new TypeError('Invalid monetary amount');
  const [whole, fraction = ''] = text.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > BigInt(MAX_CENTS)) throw new TypeError('Monetary limit exceeded');
  return Number(amount);
}
function decimal(amount) {
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_CENTS) throw new TypeError('Invalid cents');
  return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
}
module.exports = { cents, decimal, MAX_CENTS };
