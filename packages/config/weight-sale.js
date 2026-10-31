// Shared rules for bulk products. Prices are per kilogram; persistence uses whole grams.
const isSoldByWeight = (product) => product?.saleUnit === 'WEIGHT' || product?.soldByWeight === true;

const hasMinimumWeight = (product) => {
  if (product?.minWeightKg == null || product?.minWeightKg === '' || typeof product?.minWeightKg === 'boolean') {
    return false;
  }
  const n = Number(product.minWeightKg);
  return Number.isFinite(n) && n >= 0.001;
};

const minimumWeight = (product) =>
  hasMinimumWeight(product) ? Math.round(Number(product.minWeightKg) * 1000) / 1000 : 0.001;

const defaultSaleWeight = (product) => (hasMinimumWeight(product) ? minimumWeight(product) : 1);

// Sin minKg explícito el mínimo es 1 kg, igual que defaultSaleWeight para
// productos sin mínimo configurado.
function parseWeightInput(value, unit, pricePerKg, minKg = 1) {
  if (value == null || typeof value === 'boolean') return null;
  const text = String(value).trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  const effectiveMin = Math.max(0.001, Number(minKg) || 0.001);
  if (!Number.isFinite(number) || number <= 0) return null;
  if (unit === 'pesos' && (!Number.isFinite(pricePerKg) || pricePerKg <= 0)) return null;
  const raw = unit === 'pesos' ? number / pricePerKg : unit === 'g' ? number / 1000 : number;
  if (!Number.isFinite(raw) || raw + 1e-10 < effectiveMin || raw > 10000) return null;
  const kg = Math.round(raw * 1000) / 1000;
  return kg >= effectiveMin && kg > 0 ? kg : null;
}

function resolveSaleWeight(product, value, quantity) {
  if (!isSoldByWeight(product)) return null;
  const min = minimumWeight(product);
  // Clientes viejos mandan los kilos en quantity. Sin peso ni quantity no hay
  // venta por peso que resolver.
  const raw = value ?? quantity;
  if (raw == null) return null;
  const kg = parseWeightInput(raw, 'kg', 1, min);
  if (kg == null) {
    const error = new Error(
      `El mínimo de compra de ${product.name || 'este producto'} es ${min} kg (${Math.round(min * 1000)} g). Ingresa un peso válido (máximo 10000 kg).`
    );
    error.code = 'INVALID_WEIGHT';
    throw error;
  }
  return kg;
}

function normalizeMinimumWeight(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') {
    const error = new Error('El mínimo debe ser de 0.001 a 10000 kg, con máximo 3 decimales.');
    error.code = 'INVALID_WEIGHT';
    throw error;
  }
  const text = String(value).trim().replace(',', '.');
  const kg = text ? Number(text) : NaN;
  if (!Number.isFinite(kg) || kg < 0.001 || kg > 10000 || Math.abs(kg * 1000 - Math.round(kg * 1000)) > 1e-7) {
    const error = new Error('El mínimo debe ser de 0.001 a 10000 kg, con máximo 3 decimales.');
    error.code = 'INVALID_WEIGHT';
    throw error;
  }
  return Math.round(kg * 1000) / 1000;
}

function weightDisplayName(name, kg) {
  const clean = String(name || '')
    .replace(/^1\s*kg\s*(de\s*)?/i, '')
    .replace(/\s*·\s*[\d.]+\s*g$/i, '')
    .trim();
  return `${clean} · ${Math.round(kg * 1000)} g`;
}

// Boneless por kilo de Master Burguer's (MenuItem.id). Los tests lo usan como fixture.
const BONELESS_KILO_ID = 'cmpp2pipe00c81qpl3me2i2v2';

module.exports = {
  BONELESS_KILO_ID,
  isSoldByWeight,
  hasMinimumWeight,
  minimumWeight,
  defaultSaleWeight,
  parseWeightInput,
  resolveSaleWeight,
  normalizeMinimumWeight,
  weightDisplayName,
};
