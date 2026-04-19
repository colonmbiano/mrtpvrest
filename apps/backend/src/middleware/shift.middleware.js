const { prisma } = require('@mrtpvrest/database');

// Bloqueo de turno: exige que el empleado opere en su sucursal y que esa
// sucursal tenga un CashShift abierto. Inyecta req.shiftId al pasar.
const requireActiveShift = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Sesión no válida' });
    }
    if (!req.locationId) {
      return res.status(400).json({ error: 'Sucursal no identificada' });
    }

    // 1. El empleado solo puede operar en su sucursal asignada.
    //    Los usuarios no-empleados (ADMIN/SUPER_ADMIN) pueden operar en
    //    cualquier sucursal del restaurante (resuelto por tenant middleware).
    if (req.user.isEmployee && req.user.locationId !== req.locationId) {
      return res.status(403).json({
        error: 'No tienes permisos para operar en esta sucursal',
        code: 'WRONG_LOCATION',
      });
    }

    // 2. Debe existir un turno abierto para esta sucursal.
    const activeShift = await prisma.cashShift.findFirst({
      where: { locationId: req.locationId, isOpen: true },
      select: { id: true },
      orderBy: { openedAt: 'desc' },
    });

    if (!activeShift) {
      return res.status(403).json({
        error: 'No hay turno de caja abierto en esta sucursal',
        code: 'NO_ACTIVE_SHIFT',
      });
    }

    req.shiftId = activeShift.id;
    next();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

module.exports = { requireActiveShift };
