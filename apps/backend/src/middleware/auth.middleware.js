const jwt    = require('jsonwebtoken')
const prisma = require('@mrtpvrest/database').prisma

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      return res.status(401).json({ error: 'Token requerido' });

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = payload.userId || payload.id;

    // Intentar buscar el usuario
    let user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, restaurantId: true, tenantId: true },
    });

    if (!user) {
      // Intentar buscar como empleado si no es usuario
      const emp = await prisma.employee.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          role: true,
          isActive: true,
          locationId: true,
          canCharge: true,
          canDiscount: true,
          canModifyTickets: true,
          canDeleteTickets: true,
          canConfigSystem: true,
          canTakeDelivery: true,
          canTakeTakeout: true,
          canManageShifts: true,
        },
      });
      if (emp) user = { ...emp, email: null, isEmployee: true };
    }

    if (!user || !user.isActive)
      return res.status(401).json({ error: 'Sesión no válida o usuario inactivo' });

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    return res.status(401).json({ error: 'Token invalido' });
  }
};

// Middleware para administradores de restaurante (ADMIN) o SUPER_ADMIN
const requireAdmin = (req, res, next) => {
  if (req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN') {
    next();
  } else {
    return res.status(403).json({ error: 'Acceso restringido a administradores' });
  }
};

// Middleware exclusivo para ti (SUPER_ADMIN)
const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role === 'SUPER_ADMIN') {
    next();
  } else {
    return res.status(403).json({ error: 'Acceso denegado: Se requiere rol de Super Administrador' });
  }
};

// Middleware flexible — acepta cualquier combinación de roles
// Uso: requireRole('CASHIER', 'WAITER', 'ADMIN')
const requireRole = (...roles) => (req, res, next) => {
  if (roles.includes(req.user?.role)) return next();
  return res.status(403).json({ error: `Acceso restringido. Roles permitidos: ${roles.join(', ')}` });
};

module.exports = { authenticate, requireAdmin, requireSuperAdmin, requireRole }
