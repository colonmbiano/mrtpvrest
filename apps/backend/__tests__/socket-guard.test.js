'use strict';

// Tests del socket-guard: rate limit de eventos, revalidación de principales
// (Device → User → Employee, espejo de auth.middleware) y validación de
// pertenencia de location/order al restaurante del socket.

jest.mock('@mrtpvrest/database', () => ({
  prisma: {
    device:   { findUnique: jest.fn() },
    user:     { findUnique: jest.fn() },
    employee: { findUnique: jest.fn() },
    location: { findFirst: jest.fn() },
    order:    { findFirst: jest.fn() },
  },
  runWithBypass: (fn) => fn(),
}));

const { prisma } = require('@mrtpvrest/database');
const {
  createEventLimiter,
  isPrincipalActive,
  locationBelongsToRestaurant,
  orderBelongsToRestaurant,
} = require('../src/lib/socket-guard');

beforeEach(() => jest.clearAllMocks());

describe('createEventLimiter', () => {
  it('permite hasta el límite y bloquea el excedente dentro de la ventana', () => {
    const allow = createEventLimiter('s1', 3);
    expect(allow()).toBe(true);
    expect(allow()).toBe(true);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    expect(allow()).toBe(false);
  });

  it('resetea el cupo al rotar la ventana de 60s', () => {
    jest.useFakeTimers();
    const allow = createEventLimiter('s1', 2);
    expect(allow()).toBe(true);
    expect(allow()).toBe(true);
    expect(allow()).toBe(false);
    jest.advanceTimersByTime(61_000);
    expect(allow()).toBe(true);
    jest.useRealTimers();
  });
});

describe('isPrincipalActive', () => {
  it('socket anónimo (sin id) no se toca', async () => {
    expect(await isPrincipalActive(null)).toBe(true);
    expect(await isPrincipalActive({})).toBe(true);
  });

  it('Device: refleja isActive y no consulta User/Employee', async () => {
    prisma.device.findUnique.mockResolvedValue({ isActive: false });
    expect(await isPrincipalActive({ id: 'd1', isDevice: true })).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('User activo → true; Employee desactivado → false', async () => {
    prisma.user.findUnique.mockResolvedValue({ isActive: true });
    expect(await isPrincipalActive({ userId: 'u1' })).toBe(true);

    prisma.user.findUnique.mockResolvedValue(null);
    prisma.employee.findUnique.mockResolvedValue({ isActive: false });
    expect(await isPrincipalActive({ id: 'e1' })).toBe(false);
  });

  it('principal borrado → false; error de BD → true (no tumbar sockets sanos)', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.employee.findUnique.mockResolvedValue(null);
    expect(await isPrincipalActive({ id: 'x' })).toBe(false);

    prisma.user.findUnique.mockRejectedValue(new Error('db down'));
    expect(await isPrincipalActive({ id: 'x' })).toBe(true);
  });
});

describe('validación de pertenencia en joins', () => {
  it('location de otro restaurante → false', async () => {
    prisma.location.findFirst.mockResolvedValue(null);
    expect(await locationBelongsToRestaurant('locB', 'r1')).toBe(false);
    expect(prisma.location.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'locB', restaurantId: 'r1' },
    }));
  });

  it('order del propio restaurante → true', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'o1' });
    expect(await orderBelongsToRestaurant('o1', 'r1')).toBe(true);
  });

  it('ids no-string o desproporcionados se rechazan sin tocar la BD', async () => {
    expect(await orderBelongsToRestaurant({ hack: true }, 'r1')).toBe(false);
    expect(await orderBelongsToRestaurant('x'.repeat(65), 'r1')).toBe(false);
    expect(await locationBelongsToRestaurant(123, 'r1')).toBe(false);
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    expect(prisma.location.findFirst).not.toHaveBeenCalled();
  });
});
