'use strict';

const { z } = require('zod');
const { validateBody, validateQuery, validateParams } = require('../src/lib/validate');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('lib/validate', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.coerce.number().int().nonnegative(),
  });

  test('validateBody — pasa cuando el body es válido', () => {
    const req = { body: { name: 'Eduardo', age: '34' } };
    const res = mockRes();
    const next = jest.fn();

    validateBody(schema)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    // Coerción aplicada: age pasa a number.
    expect(req.body).toEqual({ name: 'Eduardo', age: 34 });
  });

  test('validateBody — 400 VALIDATION_ERROR cuando falta un campo', () => {
    const req = { body: { age: 30 } };
    const res = mockRes();
    const next = jest.fn();

    validateBody(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'VALIDATION_ERROR',
      details: expect.any(Array),
    }));
    const payload = res.json.mock.calls[0][0];
    expect(payload.details[0].path).toBe('name');
  });

  test('validateBody — error genérico no-Zod pasa por next(err)', () => {
    const explosive = {
      parse: () => { throw new Error('algo mas que zod'); }
    };
    const req = { body: {} };
    const res = mockRes();
    const next = jest.fn();

    validateBody(explosive)(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  test('validateQuery y validateParams se construyen igual', () => {
    const querySchema = z.object({ q: z.string() });
    const req = { query: { q: 'pizza' } };
    const res = mockRes();
    const next = jest.fn();

    validateQuery(querySchema)(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.query).toEqual({ q: 'pizza' });
  });
});
