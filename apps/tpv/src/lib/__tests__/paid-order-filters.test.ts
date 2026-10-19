import { matchesPayFilter } from '../paid-order-filters';

describe('grupos de pago de Cobradas', () => {
  it.each([
    ['CASH', 'CASH'], ['CASH_ON_DELIVERY', 'CASH'],
    ['TRANSFER', 'TRANSFER'], ['SPEI', 'TRANSFER'], ['OXXO', 'TRANSFER'],
    ['CARD', 'CARD'], ['CARD_PRESENT', 'CARD'],
    ['ONLINE', 'OTHER'], ['MIXED', 'OTHER'], ['COURTESY', 'OTHER'], ['OTHER', 'OTHER'],
  ])('%s pertenece solo al grupo %s', (paymentMethod, expectedGroup) => {
    for (const group of ['CASH', 'TRANSFER', 'CARD', 'OTHER']) {
      expect(matchesPayFilter({ paymentMethod }, group)).toBe(group === expectedGroup);
      expect(matchesPayFilter({ paymentMethod: paymentMethod.toLowerCase() }, group)).toBe(group === expectedGroup);
    }
    expect(matchesPayFilter({ paymentMethod }, 'Todos')).toBe(true);
  });

  it.each([null, undefined, '', 'UNKNOWN'])('mantiene %s visible en Todos sin inventar un grupo', paymentMethod => {
    expect(matchesPayFilter({ paymentMethod }, 'Todos')).toBe(true);
    for (const group of ['CASH', 'TRANSFER', 'CARD', 'OTHER']) {
      expect(matchesPayFilter({ paymentMethod }, group)).toBe(false);
    }
  });
});
