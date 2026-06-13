const {
  PromoPriceValidationError,
  resolvePromoPricing,
} = require('../src/lib/promo-price');

describe('resolvePromoPricing', () => {
  test('guarda el precio promocional cuando es válido', () => {
    expect(resolvePromoPricing({
      isPromo: true,
      promoPrice: 80,
      regularPrice: 100,
    })).toEqual({ isPromo: true, promoPrice: 80 });
  });

  test('limpia el precio al desactivar la promoción', () => {
    expect(resolvePromoPricing({
      isPromo: false,
      promoPrice: 80,
      regularPrice: 100,
      currentIsPromo: true,
      currentPromoPrice: 80,
    })).toEqual({ isPromo: false, promoPrice: null });
  });

  test.each([null, '', 0, 100, 120])(
    'rechaza un precio promocional inválido: %p',
    (promoPrice) => {
      expect(() => resolvePromoPricing({
        isPromo: true,
        promoPrice,
        regularPrice: 100,
      })).toThrow(PromoPriceValidationError);
    },
  );

  test('revalida la promoción existente cuando cambia el precio regular', () => {
    expect(() => resolvePromoPricing({
      regularPrice: 70,
      currentIsPromo: true,
      currentPromoPrice: 80,
    })).toThrow(PromoPriceValidationError);
  });
});
