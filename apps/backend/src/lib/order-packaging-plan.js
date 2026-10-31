'use strict';
const { createHash } = require('node:crypto');
const { usesPackaging } = require('./order-packaging');
function describePlan(order, lines) {
  const counts = new Map(), extras = new Map();
  for (const line of lines) {
    for (const f of line.flatItems.filter(f => f.ingredient.isPackaging)) {
      if (!line.isPackagingProduct && !usesPackaging(order.orderType)) continue;
      const map = line.isPackagingProduct ? extras : counts;
      const id = f.ingredient.id;
      map.set(id, (map.get(id) || 0) + f.qtyToConsumePerUnit * Number(line.item.weightKg ?? line.item.quantity));
    }
  }
  const signature = createHash('sha256').update(JSON.stringify([order.orderType,
    lines.map(l => [l.item.id, l.item.menuItemId, l.item.quantity, String(l.item.weightKg), l.isPackagingProduct,
      l.flatItems.map(f => [f.ingredient.id, f.qtyToConsumePerUnit, !!f.ingredient.isPackaging]).sort()]).sort(),
  ])).digest('hex');
  return { counts, extras, signature };
}
module.exports = { describePlan };
