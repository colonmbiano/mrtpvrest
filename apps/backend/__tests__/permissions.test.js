'use strict';

// Tests del mapa canónico de permisos RBAC (Fase 10 · "RBAC real").
// Función pura sobre flags del Employee — sin Prisma ni red.

const {
  mapPermissions,
  PERM_TO_FLAG,
  FLAG_TO_PERM,
} = require('../src/lib/permissions');

describe('mapPermissions', () => {
  it('mapea flags Fase 10 a strings canónicos', () => {
    const perms = mapPermissions({
      canCharge: true,
      canApplyDiscounts: true,
      canCancelItems: true,
      canReopenTables: true,
      canManageUsers: true,
    });
    expect(perms.sort()).toEqual(
      ['apply_discount', 'cancel_items', 'manage_users', 'open_cash_drawer', 'reopen_table'].sort(),
    );
  });

  it('unifica el legacy canDiscount en apply_discount', () => {
    expect(mapPermissions({ canDiscount: true })).toContain('apply_discount');
    expect(mapPermissions({ canApplyDiscounts: true })).toContain('apply_discount');
    // No duplica si ambos están activos
    const both = mapPermissions({ canDiscount: true, canApplyDiscounts: true });
    expect(both.filter((p) => p === 'apply_discount')).toHaveLength(1);
  });

  it('NO traduce columnas legacy deprecadas', () => {
    const perms = mapPermissions({
      canModifyTickets: true,
      canDeleteTickets: true,
      canConfigSystem: true,
      canTakeDelivery: true,
      canTakeTakeout: true,
      canManageShifts: true,
    });
    expect(perms).toEqual([]);
  });

  it('tolera entrada nula/vacía', () => {
    expect(mapPermissions(null)).toEqual([]);
    expect(mapPermissions({})).toEqual([]);
  });
});

describe('PERM_TO_FLAG / FLAG_TO_PERM', () => {
  it('son inversos consistentes', () => {
    for (const [flag, perm] of Object.entries(FLAG_TO_PERM)) {
      expect(PERM_TO_FLAG[perm]).toBe(flag);
    }
  });

  it('cubre el set canónico esperado', () => {
    expect(PERM_TO_FLAG).toMatchObject({
      apply_discount: 'canApplyDiscounts',
      cancel_items: 'canCancelItems',
      reopen_table: 'canReopenTables',
      manage_users: 'canManageUsers',
      open_cash_drawer: 'canCharge',
    });
  });
});
