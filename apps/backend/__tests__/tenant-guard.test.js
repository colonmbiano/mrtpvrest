'use strict';

// Tests del tenant-guard. Requerimos el submódulo directo (no el index.js del
// paquete, que instancia PrismaClient y exige DATABASE_URL).
const fs = require('fs');
const path = require('path');
const guard = require('@mrtpvrest/database/tenant-guard');

const {
  tenantGuard,
  runWithTenant,
  runWithBypass,
  getTenantContext,
  SCOPED_MODELS,
} = guard;

// Helper: invoca el hook $allOperations de la extensión con un `query` espía.
function makeRunner(mode, logger) {
  const ext = tenantGuard({ mode, logger });
  const op = ext.query.$allModels.$allOperations;
  return async ({ model, operation, args }) => {
    let received;
    const query = (a) => {
      received = a;
      return Promise.resolve('RESULT');
    };
    const result = await op({ model, operation, args, query });
    return { result, received };
  };
}

const RID = 'rest_123';

describe('tenant-guard :: SCOPED_MODELS en sync con el schema', () => {
  test('cada modelo con columna restaurantId está en SCOPED_MODELS', () => {
    const schemaPath = path.resolve(
      __dirname,
      '../../../packages/database/prisma/schema.prisma'
    );
    const schema = fs.readFileSync(schemaPath, 'utf8');

    const modelsWithRid = new Set();
    const re = /^model\s+(\w+)\s*\{([\s\S]*?)\n\}/gm;
    let m;
    while ((m = re.exec(schema)) !== null) {
      const [, name, body] = m;
      if (/\n\s*restaurantId\s+String/.test(body)) modelsWithRid.add(name);
    }

    expect(modelsWithRid.size).toBeGreaterThan(0);
    const missing = [...modelsWithRid].filter((x) => !SCOPED_MODELS.has(x));
    const extra = [...SCOPED_MODELS].filter((x) => !modelsWithRid.has(x));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });
});

describe('tenant-guard :: contexto AsyncLocalStorage', () => {
  test('getTenantContext es null fuera de un scope', () => {
    expect(getTenantContext()).toBeNull();
  });

  test('runWithTenant propaga el contexto', () => {
    runWithTenant({ restaurantId: RID }, () => {
      expect(getTenantContext()).toEqual({ restaurantId: RID });
    });
  });

  test('runWithBypass marca bypass conservando el resto del contexto', () => {
    runWithTenant({ restaurantId: RID, role: 'CASHIER' }, () => {
      runWithBypass(() => {
        expect(getTenantContext()).toEqual({
          restaurantId: RID,
          role: 'CASHIER',
          bypass: true,
        });
      });
      // Al salir del bypass, el contexto original permanece intacto.
      expect(getTenantContext()).toEqual({ restaurantId: RID, role: 'CASHIER' });
    });
  });
});

describe('tenant-guard :: modo enforce', () => {
  const run = makeRunner('enforce');

  test('inyecta restaurantId en where (findMany)', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'MenuItem',
        operation: 'findMany',
        args: { where: { isActive: true } },
      });
      expect(received.where).toEqual({ isActive: true, restaurantId: RID });
    });
  });

  test('inyecta restaurantId en findUnique (extendedWhereUnique)', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'Order',
        operation: 'findUnique',
        args: { where: { id: 'order_1' } },
      });
      expect(received.where).toEqual({ id: 'order_1', restaurantId: RID });
    });
  });

  test('inyecta restaurantId en update y delete', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const upd = await run({
        model: 'Coupon',
        operation: 'update',
        args: { where: { id: 'c1' }, data: { isActive: false } },
      });
      expect(upd.received.where).toEqual({ id: 'c1', restaurantId: RID });

      const del = await run({
        model: 'Coupon',
        operation: 'delete',
        args: { where: { id: 'c1' } },
      });
      expect(del.received.where).toEqual({ id: 'c1', restaurantId: RID });
    });
  });

  test('crea where cuando no existe (count sin where)', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'Order',
        operation: 'count',
        args: {},
      });
      expect(received.where).toEqual({ restaurantId: RID });
    });
  });

  test('inyecta restaurantId en data (create)', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'Category',
        operation: 'create',
        args: { data: { name: 'Bebidas' } },
      });
      expect(received.data).toEqual({ name: 'Bebidas', restaurantId: RID });
    });
  });

  test('inyecta restaurantId en cada fila de createMany', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'Category',
        operation: 'createMany',
        args: { data: [{ name: 'A' }, { name: 'B', restaurantId: 'otro' }] },
      });
      expect(received.data).toEqual([
        { name: 'A', restaurantId: RID },
        { name: 'B', restaurantId: 'otro' }, // respeta el explícito
      ]);
    });
  });

  test('upsert: scopea where y create', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'RestaurantConfig',
        operation: 'upsert',
        args: {
          where: { id: 'cfg1' },
          create: { theme: 'dark' },
          update: { theme: 'light' },
        },
      });
      expect(received.where).toEqual({ id: 'cfg1', restaurantId: RID });
      expect(received.create).toEqual({ theme: 'dark', restaurantId: RID });
    });
  });

  test('respeta un restaurantId explícito en el where', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({
        model: 'MenuItem',
        operation: 'findMany',
        args: { where: { restaurantId: 'explicito' } },
      });
      expect(received.where).toEqual({ restaurantId: 'explicito' });
    });
  });

  test('NO toca modelos fuera de SCOPED_MODELS', async () => {
    await runWithTenant({ restaurantId: RID }, async () => {
      const args = { where: { id: 'p1' } };
      const { received } = await run({
        model: 'Plan',
        operation: 'findUnique',
        args,
      });
      expect(received).toBe(args);
    });
  });

  test('passthrough con bypass / SUPER_ADMIN / sin restaurantId / sin contexto', async () => {
    const args = { where: { isActive: true } };

    // bypass
    await runWithTenant({ restaurantId: RID, bypass: true }, async () => {
      const { received } = await run({ model: 'User', operation: 'findMany', args });
      expect(received).toBe(args);
    });
    // SUPER_ADMIN
    await runWithTenant({ restaurantId: RID, role: 'SUPER_ADMIN' }, async () => {
      const { received } = await run({ model: 'User', operation: 'findMany', args });
      expect(received).toBe(args);
    });
    // contexto sin restaurantId
    await runWithTenant({ restaurantId: null }, async () => {
      const { received } = await run({ model: 'User', operation: 'findMany', args });
      expect(received).toBe(args);
    });
    // sin contexto (jobs/seeds)
    const { received } = await run({ model: 'User', operation: 'findMany', args });
    expect(received).toBe(args);
  });
});

describe('tenant-guard :: modo warn (no altera, solo observa)', () => {
  test('NO modifica args y registra cuando falta el filtro', async () => {
    const logger = { warn: jest.fn() };
    const run = makeRunner('warn', logger);
    const args = { where: { isActive: true } };
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({ model: 'Order', operation: 'findMany', args });
      expect(received).toBe(args); // sin cambios
    });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toMatch(/Order\.findMany sin filtro restaurantId/);
  });

  test('NO registra cuando la query ya está scopeada', async () => {
    const logger = { warn: jest.fn() };
    const run = makeRunner('warn', logger);
    await runWithTenant({ restaurantId: RID }, async () => {
      await run({
        model: 'Order',
        operation: 'findMany',
        args: { where: { restaurantId: RID } },
      });
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

describe('tenant-guard :: modo off', () => {
  test('passthrough total incluso con contexto', async () => {
    const logger = { warn: jest.fn() };
    const run = makeRunner('off', logger);
    const args = { where: {} };
    await runWithTenant({ restaurantId: RID }, async () => {
      const { received } = await run({ model: 'Order', operation: 'findMany', args });
      expect(received).toBe(args);
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
