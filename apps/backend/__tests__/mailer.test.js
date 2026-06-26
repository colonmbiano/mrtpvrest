'use strict';

// Tests de las funciones PURAS del mailer (sin red, sin Resend):
//   - parseEmailList: parseo/validación/dedup de la lista de destinatarios.
//   - cashCutEmailHtml: el HTML del corte refleja las cifras y el desfase.

const { parseEmailList, cashCutEmailHtml } = require('../src/utils/mailer');

describe('parseEmailList', () => {
  it('separa por coma, punto y coma, espacios y saltos de línea', () => {
    expect(parseEmailList('a@x.com, b@y.com; c@z.com\nd@w.com e@v.com')).toEqual([
      'a@x.com', 'b@y.com', 'c@z.com', 'd@w.com', 'e@v.com',
    ]);
  });

  it('descarta entradas sin forma de correo', () => {
    expect(parseEmailList('hola, no-es-correo, b@y.com, @x.com, a@b')).toEqual(['b@y.com']);
  });

  it('normaliza a minúsculas y deduplica', () => {
    expect(parseEmailList('Dueno@Correo.com, dueno@correo.com , OTRO@correo.com')).toEqual([
      'dueno@correo.com', 'otro@correo.com',
    ]);
  });

  it('devuelve [] para vacío, null o no-string', () => {
    expect(parseEmailList('')).toEqual([]);
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList(undefined)).toEqual([]);
    expect(parseEmailList(123)).toEqual([]);
    expect(parseEmailList('   ')).toEqual([]);
  });
});

describe('cashCutEmailHtml', () => {
  const base = {
    restaurantName: 'Master Burguer\'s',
    locationName: 'Centro',
    closedAtLabel: 'lunes, 23 de junio, 10:30 p.m.',
    closedByName: 'Mau',
    ordersCount: 42,
    totalCash: 1234.5,
    totalCard: 800,
    totalTransfer: 200,
    totalCourtesy: 0,
    totalSales: 2234.5,
    openingFloat: 500,
    totalCashIn: 100,
    totalExpenses: 50,
    expectedCash: 1784.5,
    closingFloat: 1784.5,
    variance: 0,
    notes: '',
    adminUrl: 'https://admin.mrtpvrest.com/admin/reportes/cortes',
  };

  it('incluye nombre del restaurante, sucursal y cifras clave', () => {
    const html = cashCutEmailHtml(base);
    expect(html).toContain("Master Burguer's");
    expect(html).toContain('Centro');
    expect(html).toContain('Mau');
    expect(html).toContain('$2,234.50'); // venta total
    expect(html).toContain('$1,784.50'); // efectivo esperado
    expect(html).toContain(base.adminUrl);
  });

  it('marca "Cuadra exacto" cuando la varianza es 0', () => {
    expect(cashCutEmailHtml(base)).toContain('Cuadra exacto');
  });

  it('muestra Faltante en rojo cuando contaron de menos', () => {
    const html = cashCutEmailHtml({ ...base, closingFloat: 1684.5, variance: -100 });
    expect(html).toContain('Faltante $100.00');
    expect(html).toContain('#dc2626');
  });

  it('muestra Sobrante cuando contaron de más', () => {
    const html = cashCutEmailHtml({ ...base, closingFloat: 1884.5, variance: 100 });
    expect(html).toContain('Sobrante $100.00');
  });

  it('muestra "—" en la diferencia si no hay efectivo contado', () => {
    const html = cashCutEmailHtml({ ...base, closingFloat: null, variance: null });
    expect(html).toContain('—');
  });

  it('escapa "<" en las notas para evitar inyección de HTML', () => {
    const html = cashCutEmailHtml({ ...base, notes: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('agrega la etiqueta de módulo al encabezado (TIENDA) cuando se pasa', () => {
    expect(cashCutEmailHtml({ ...base, moduleLabel: 'Tienda' })).toContain('CORTE DE CAJA · TIENDA');
    // Sin moduleLabel el encabezado queda limpio.
    expect(cashCutEmailHtml(base)).toContain('CORTE DE CAJA</h1>');
  });

  it('omite el botón "ver cortes" cuando adminUrl es null', () => {
    const html = cashCutEmailHtml({ ...base, adminUrl: null });
    expect(html).not.toContain('Ver cortes en el panel');
  });
});
