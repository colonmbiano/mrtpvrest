// Middleware factory para validar req.body / req.query / req.params con Zod.
//
// Uso:
//   const { validateBody } = require('../lib/validate');
//   const { createOrderSchema } = require('../schemas/orders.schema');
//
//   router.post('/tpv', validateBody(createOrderSchema), authenticate, ...)
//
// Si la validación falla devuelve 400 con detalle de los campos inválidos.
// Si pasa, sustituye req.body / query / params por la versión parseada (los
// tipos quedan coercionados según el schema).

const { ZodError } = require('zod');

function formatZodError(err) {
  return err.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    code: i.code,
    message: i.message,
  }));
}

function validate(target) {
  return (schema) => (req, res, next) => {
    try {
      const parsed = schema.parse(req[target]);
      req[target] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({
          error: 'Datos inválidos',
          code: 'VALIDATION_ERROR',
          details: formatZodError(err),
        });
      }
      next(err);
    }
  };
}

module.exports = {
  validateBody:   validate('body'),
  validateQuery:  validate('query'),
  validateParams: validate('params'),
};
