'use strict';

// Token firmado del QR de mesa (lib/table-qr).

const OLD_ENV = { ...process.env };

beforeEach(() => {
  jest.resetModules();
  process.env = { ...OLD_ENV, TABLE_QR_SECRET: 'llave-de-pruebas-32-bytes-o-mas!!' };
});

afterAll(() => { process.env = OLD_ENV; });

function lib() { return require('../src/lib/table-qr'); }

describe('signTableToken / verifyTableToken', () => {
  it('ida y vuelta: devuelve el tableId y el número firmados', () => {
    const { signTableToken, verifyTableToken } = lib();
    const token = signTableToken({ tableId: 'ckt_mesa_7', number: 7 });

    expect(token).toBeTruthy();
    expect(verifyTableToken(token)).toEqual({ tableId: 'ckt_mesa_7', number: 7 });
  });

  it('alterar el payload invalida la firma', () => {
    const { signTableToken, verifyTableToken } = lib();
    const token = signTableToken({ tableId: 'ckt_mesa_7', number: 7 });

    // Repayload apuntando a otra mesa, conservando la firma original.
    const forged = `${Buffer.from('ckt_mesa_1.1').toString('base64url')}.${token.split('.')[1]}`;
    expect(verifyTableToken(forged)).toBeNull();
  });

  it('firma de otra llave → rechazado (no se puede fabricar desde fuera)', () => {
    const { signTableToken } = lib();
    const token = signTableToken({ tableId: 'ckt_mesa_7', number: 7 });

    jest.resetModules();
    process.env.TABLE_QR_SECRET = 'otra-llave-distinta-para-el-tenant';
    expect(lib().verifyTableToken(token)).toBeNull();
  });

  it('basura, vacío y no-strings → null, sin reventar', () => {
    const { verifyTableToken } = lib();
    for (const bad of ['', 'x', 'sin-punto', '.', 'a.b.c', null, undefined, 42, {}]) {
      expect(verifyTableToken(bad)).toBeNull();
    }
  });

  it('token absurdamente largo → null sin calcular HMAC', () => {
    const { verifyTableToken } = lib();
    expect(verifyTableToken('a'.repeat(5000))).toBeNull();
  });

  it('sin llave configurada no firma ni verifica (cae al esquema legacy)', () => {
    jest.resetModules();
    delete process.env.TABLE_QR_SECRET;
    delete process.env.JWT_SECRET;
    const { signTableToken, verifyTableToken } = lib();

    expect(signTableToken({ tableId: 't1', number: 1 })).toBe('');
    expect(verifyTableToken('lo-que-sea.firma')).toBeNull();
  });

  it('usa JWT_SECRET si no hay TABLE_QR_SECRET', () => {
    jest.resetModules();
    delete process.env.TABLE_QR_SECRET;
    process.env.JWT_SECRET = 'secreto-jwt-de-pruebas';
    const { signTableToken, verifyTableToken } = lib();

    const token = signTableToken({ tableId: 't9', number: 9 });
    expect(verifyTableToken(token)).toEqual({ tableId: 't9', number: 9 });
  });

  it('mesa sin número (nombre sin dígitos) → number null, el id sigue firmado', () => {
    const { signTableToken, verifyTableToken } = lib();
    const token = signTableToken({ tableId: 'ckt_barra', number: null });

    expect(verifyTableToken(token)).toEqual({ tableId: 'ckt_barra', number: null });
  });

  it('el token se mantiene corto para que el QR siga siendo legible', () => {
    const { signTableToken } = lib();
    const token = signTableToken({ tableId: 'clzq8x9y70000abcdefghijkl', number: 12 });

    expect(token.length).toBeLessThan(80);
  });
});
