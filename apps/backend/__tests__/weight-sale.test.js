const { BONELESS_KILO_ID, isSoldByWeight, parseWeightInput, resolveSaleWeight } = require('../../../packages/config/weight-sale');
const product = { id: BONELESS_KILO_ID, saleUnit: 'WEIGHT', price: 320 };
test.each([['1', 'kg', 1], ['1,5', 'kg', 1.5], ['1500', 'g', 1.5], ['320', 'pesos', 1], ['480', 'pesos', 1.5], ['500', 'pesos', 1.563]])('convierte %s %s a %s kg', (value, unit, kg) => {
  expect(parseWeightInput(value, unit, 320)).toBe(kg);
});
test.each([['', 'kg'], ['999', 'g'], ['319.99', 'pesos'], ['0.9999', 'kg'], ['Infinity', 'kg']])('bloquea %s %s', (value, unit) => expect(parseWeightInput(value, unit, 320)).toBeNull());
test('no cambia otros productos ni pedidos históricos de kilos enteros', () => {
  expect(isSoldByWeight({ id: 'other' })).toBe(false);
  expect(resolveSaleWeight({ id: 'other', price: 320 }, 0.5)).toBeNull();
  expect(resolveSaleWeight(product, undefined)).toBeNull();
  expect(resolveSaleWeight(product, 1.5)).toBe(1.5);
});
