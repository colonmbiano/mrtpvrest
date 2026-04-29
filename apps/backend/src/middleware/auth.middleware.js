const jwt    = require('jsonwebtoken')
const prisma = require('@mrtpvrest/database').prisma

// Tipo del JWT que firma el endpoint /api/employees/authorize-action.
// Vida útil corta (30s) para que sea de un solo uso práctico.
const PERMISSION_OVERRIDE_TTL_SEC = 30;
const PERMISSION_OVERRIDE_KIND = 'permission-override';

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
      // Intentar buscar como empleado si no es usuario.
      // Cargamos location → restaurant para resolver tenantId/restaurantId del empleado,
      // ya que Employee no tiene esos campos en su tabla. Esto garantiza que
      // requireTenantAccess encuentre `req.user.tenantId` aunque el JWT antiguo
      // no lo incluyera explícitamente.
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
          location: {
            select: {
              restaurantId: true,
              restaurant: { select: { tenantId: true } },
            },
          },
        },
      });
      if (emp) {
        const restaurantId = emp.location?.restaurantId ?? payload.restaurantId ?? null;
        const tenantId     = emp.location?.restaurant?.tenantId ?? payload.tenantId ?? null;
        const { location, ...empBase } = emp;
        user = { ...empBase, restaurantId, tenantId, email: null, isEmployee: true };
      }
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

// Roles que tienen TODOS los permisos automáticamente (admin-equivalentes).
// Si necesitas un override más granular, configura el flag específico en el
// empleado en vez de subirle el rol.
const ADMIN_EQUIVALENT_ROLES = new Set([
  'ADMIN',
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
]);

// Verifica si el request actual tiene permiso para `perm`. Pasa si:
//  - El usuario tiene rol admin-equivalente, o
//  - req.user[perm] === true, o
//  - El header X-Permission-Override trae un JWT firmado por
//    /api/employees/authorize-action con el mismo permiso (override por PIN
//    de admin). Cuando el override es válido, marca req.permissionAuthorizedBy
//    con el id del empleado que lo autorizó para auditoría aguas abajo.
const hasPermission = (req, perm) => {
  if (ADMIN_EQUIVALENT_ROLES.has(req.user?.role)) return true;
  if (req.user?.[perm] === true) return true;

  const overrideToken = req.headers['x-permission-override'];
  if (overrideToken) {
    try {
      const decoded = jwt.verify(overrideToken, process.env.JWT_SECRET);
      if (
        decoded?.kind === PERMISSION_OVERRIDE_KIND &&
        decoded.permission === perm
      ) {
        req.permissionAuthorizedBy = decoded.authorizingEmployeeId;
        return true;
      }
    } catch {
      // token expirado o inválido: cae a deny
    }
  }
  return false;
};

// Gate de permisos por flag canX del empleado.
// Uso: requirePermission('canCharge')
//
// El 403 incluye `code: PERMISSION_DENIED` y `permission: <perm>` para que
// el frontend pueda abrir el flujo de override por PIN de administrador.
const requirePermission = (perm) => (req, res, next) => {
  if (hasPermission(req, perm)) return next();
  return res.status(403).json({
    error: 'No tienes permiso para realizar esta acción',
    code: 'PERMISSION_DENIED',
    permission: perm,
  });
};

// Firma un token de override de un solo uso (vida corta) para que el cliente
// lo reenvíe en el header X-Permission-Override del siguiente request.
const signPermissionOverride = (permission, authorizingEmployeeId) =>
  jwt.sign(
    { kind: PERMISSION_OVERRIDE_KIND, permission, authorizingEmployeeId },
    process.env.JWT_SECRET,
    { expiresIn: PERMISSION_OVERRIDE_TTL_SEC },
  );

// Aislamiento tenant — garantiza que el JWT del usuario pertenezca al mismo
// tenant que el recurso que va a tocar. Debe ir después de `authenticate` y
// de `tenantMiddleware` (que adjunta `req.restaurant`). SUPER_ADMIN puede
// cruzar tenants explícitamente.
const requireTenantAccess = (req, res, next) => {
  if (req.user?.role === 'SUPER_ADMIN') return next();

  const userTenantId = req.user?.tenantId;
  if (!userTenantId) {
    return res.status(403).json({ error: 'Usuario sin tenant asignado' });
  }

  const resourceTenantId =
    req.restaurant?.tenantId ||
    req.tenant?.id ||
    req.tenant?.tenantId ||
    null;

  if (resourceTenantId && resourceTenantId !== userTenantId) {
    return res.status(403).json({ error: 'Acceso cruzado entre tenants no permitido' });
  }

  next();
};

module.exports = {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requireRole,
  requirePermission,
  requireTenantAccess,
  ADMIN_EQUIVALENT_ROLES,
  hasPermission,
  signPermissionOverride,
  PERMISSION_OVERRIDE_TTL_SEC,
};
