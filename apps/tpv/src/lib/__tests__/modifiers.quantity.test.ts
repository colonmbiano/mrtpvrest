/** @jest-environment node */
import { buildOptionGroups, computeUnitExtra, flattenSelections, getValidationError, splitModifierSelections, quantityModifierSummary } from '../modifiers';
import type { Product, ModifierGroup } from '@/store/ticketStore';

const group: ModifierGroup = {
  id: 'tacos', name: 'Elige tus 10 tacos', groupType: 'QUANTITY', required: true,
  multiSelect: true, minSelection: 10, maxSelection: 10, freeModifiersLimit: 0,
  modifiers: ['Pastor', 'Chuleta', 'Campechano'].map((name, i) => ({ id: String(i), groupId: 'tacos', name, priceAdd: 0 })),
};
const mixed = [...Array(4).fill(group.modifiers[0]), ...Array(3).fill(group.modifiers[1]), ...Array(3).fill(group.modifiers[2])];

test('cart and kitchen summary keeps quantities without altering the order payload', () => {
  const modifiers = flattenSelections([group], { tacos: mixed });
  expect(quantityModifierSummary({ modifierGroups: [group], modifiers }).map(m => m.name))
    .toEqual(['4 Pastor', '3 Chuleta', '3 Campechano']);
  expect(modifiers).toHaveLength(10);
  expect(modifiers[0]?.name).toBe('Pastor');
});
test('preserves quantity group and every filling unit through the TPV payload', () => {
  const groups = buildOptionGroups({ modifierGroups: [group] } as Product, [], false);
  expect(groups[0]?.groupType).toBe('QUANTITY');
  const selections = { tacos: mixed };
  expect(getValidationError(groups, selections, 0, null, false)).toBeNull();
  expect(computeUnitExtra(groups, selections)).toBe(0);
  const payload = splitModifierSelections(flattenSelections(groups, selections));
  expect(payload.modifiers.map(m => m.modifierId)).toEqual(['0','0','0','0','1','1','1','2','2','2']);
});
test('blocks nine and eleven units before adding the package', () => {
  for (const selected of [mixed.slice(1), [...mixed, mixed[0]]]) {
    expect(getValidationError([group], { tacos: selected }, 0, null, false)).not.toBeNull();
  }
});
