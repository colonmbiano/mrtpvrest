import { includedTaxTotals } from "../lib/totals";

test.each([70, 80, 90, 115, 230])("el precio final $%s no aumenta al desglosar IVA", (price) => {
  const result = includedTaxTotals(price, 16);
  expect(result.total).toBe(price);
  expect(Math.round((result.subtotal + result.tax) * 100)).toBe(price * 100);
});
test("ocultar el desglose mantiene el total", () => {
  expect(includedTaxTotals(70, 0)).toEqual({ subtotal: 70, tax: 0, total: 70 });
});
