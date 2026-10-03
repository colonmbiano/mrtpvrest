const { validateQuantityGroups, compactQuantityModifiers, modifierSnapshotKey } = require('../src/lib/quantity-modifiers');
const mods = ['Pastor', 'Chuleta', 'Campechano'].map((name, i) => ({ id: String(i), name, priceAdd: 0, isAvailable: true }));
const groups = [{ groupType: 'QUANTITY', name: 'Elige tus 10 tacos', required: true, minSelection: 10, maxSelection: 10, modifiers: mods }];
const mixed = [...Array(4).fill('0'), ...Array(3).fill('1'), ...Array(3).fill('2')];

test('online replay distinguishes different proportions of the same fillings', () => {
  const signature = ids => compactQuantityModifiers(ids.map(id => ({ ...mods[Number(id)], modifierId: id })), groups).map(modifierSnapshotKey).sort();
  expect(signature(mixed)).toEqual(signature([...mixed].reverse()));
  expect(signature(mixed)).not.toEqual(signature([...Array(3).fill('0'), ...Array(4).fill('1'), ...Array(3).fill('2')]));
});
test('requires exactly ten, including when the group is missing', () => {
  for (const ids of [[], mixed.slice(1), [...mixed, '0']]) expect(() => validateQuantityGroups(groups, ids)).toThrow();
  expect(() => validateQuantityGroups(groups, mixed)).not.toThrow();
  expect(() => validateQuantityGroups(groups, Array(10).fill('0'))).not.toThrow();
});
test('rejects unavailable fillings', () => {
  expect(() => validateQuantityGroups([{ ...groups[0], modifiers: [{ ...mods[0], isAvailable: false }] }], Array(10).fill('0'))).toThrow('no disponible');
});
test('persists a compact kitchen breakdown at no extra charge', () => {
  expect(compactQuantityModifiers(mixed.map(id => mods[Number(id)]), groups).map(m => [m.name, m.priceAdd])).toEqual([['4 Pastor', 0], ['3 Chuleta', 0], ['3 Campechano', 0]]);
});
test('does not alter ordinary modifiers or lose the price of repeated paid choices', () => {
  const paid = { ...mods[0], priceAdd: 5 };
  const extra = { id: 'other', name: 'Queso', priceAdd: 8 };
  expect(compactQuantityModifiers([paid, paid, extra], groups)).toEqual([extra, { ...paid, name: '2 Pastor', priceAdd: 10 }]);
});
