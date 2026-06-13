class PromoPriceValidationError extends Error {}

function resolvePromoPricing({
  isPromo,
  promoPrice,
  regularPrice,
  currentIsPromo = false,
  currentPromoPrice = null,
}) {
  const nextIsPromo = isPromo === undefined ? currentIsPromo : Boolean(isPromo);
  if (!nextIsPromo) {
    return { isPromo: false, promoPrice: null };
  }

  const nextRegularPrice = Number(regularPrice);
  const rawPromoPrice = promoPrice === undefined ? currentPromoPrice : promoPrice;
  const nextPromoPrice = rawPromoPrice === '' || rawPromoPrice == null
    ? NaN
    : Number(rawPromoPrice);

  if (!Number.isFinite(nextPromoPrice) || nextPromoPrice <= 0 || nextPromoPrice >= nextRegularPrice) {
    throw new PromoPriceValidationError(
      'El precio promocional debe ser mayor a 0 y menor al precio regular.',
    );
  }

  return { isPromo: true, promoPrice: nextPromoPrice };
}

module.exports = { PromoPriceValidationError, resolvePromoPricing };
