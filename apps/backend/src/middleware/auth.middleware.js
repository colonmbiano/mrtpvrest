const jwt    = require('jsonwebtoken')
const { prisma, runWithBypass } = require('@mrtpvrest/database')
const { increment } = require('../lib/auth-metrics');
const { PERM_TO_FLAG } = require('../lib/permissions');
const log = require('../lib/logger')('auth');

// Roles con bypass total de RBAC granular. Coincide con el bypass del TPV
// (authStore.hasPermission): dueño/admin pueden todo sin permiso explícito.
const PRIVILEGED_ROLES = ['OWNER', 'ADMIN', 'SUPER_ADMIN'];

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      increment('token_missing');
      log.warn('token_missing', { path: req.path, method: req.method, ip: req.ip });
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const id = payload.userId || payload.id;

    // Caso 1: JWT de dispositivo (KDS, kiosko, etc.). El "actor" es el Device.
    // No hay user/employee humano detrás — el rol viene del payload.
    if (payload.isDevice) {
      // Resolución de identidad: legítimamente cross-tenant (aún no sabemos a
      // qué restaurante pertenece el actor). Saltamos el tenant-guard.
      const device = await runWithBypass(() => prisma.device.findUnique({
        where: { id },
        select: {
          id: true, type: true, isActive: true, locationId: true, tenantId: true,
          location: { select: { restaurantId: true } },
        },
      }));
      if (!device || !device.isActive) {
        increment('user_inactive');
        return res.status(401).json({ error: 'Dispositivo desactivado' });
      }
      increment('success');
      req.user = {
        id: device.id,
        name: `Device ${device.type}`,
        email: null,
        role: payload.role || 'CASHIER',
        isActive: true,
        isDevice: true,
        restaurantId: device.location?.restaurantId ?? payload.restaurantId ?? null,
        locationId:   device.locationId,
        tenantId:     device.tenantId,
      };
      return next();
    }

    // Caso 2: usuario humano. Buscar como User o Employee.
    // Resolución de identidad: cross-tenant por diseño → bypass del guard.
    let user = await runWithBypass(() => prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, restaurantId: true, tenantId: true },
    }));

    if (!user) {
      // Intentar buscar como empleado si no es usuario.
      // Cargamos location → restaurant para resolver tenantId/restaurantId del empleado,
      // ya que Employee no tiene esos campos en su tabla. Esto garantiza que
      // requireTenantAccess encuentre `req.user.tenantId` aunque el JWT antiguo
      // no lo incluyera explícitamente.
      const emp = await runWithBypass(() => prisma.employee.findUnique({
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
          // Fase 10 · permisos granulares — necesarios para `requirePermission`.
          canCancelItems: true,
          canApplyDiscounts: true,
          canReopenTables: true,
          canManageUsers: true,
          location: {
            select: {
              restaurantId: true,
              restaurant: { select: { tenantId: true } },
            },
          },
        },
      }));
      if (emp) {
        const restaurantId = emp.location?.restaurantId ?? payload.restaurantId ?? null;
        const tenantId     = emp.location?.restaurant?.tenantId ?? payload.tenantId ?? null;
        const { location, ...empBase } = emp;
        user = { ...empBase, restaurantId, tenantId, email: null, isEmployee: true };
      }
    }

    if (!user) {
      increment('user_not_found');
      log.warn('user_not_found', { id, path: req.path });
      return res.status(401).json({ error: 'Sesión no válida' });
    }
    if (!user.isActive) {
      increment('user_inactive');
      log.warn('user_inactive', { id, role: user.role });
      return res.status(401).json({ error: 'Usuario inactivo' });
    }

    increment('success');
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      increment('token_expired');
      log.warn('token_expired', { path: req.path, method: req.method });
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    increment('token_malformed');
    log.warn('token_malformed', { path: req.path, errName: error.name, errMsg: error.message });
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

// ── RBAC GRANULAR (Fase 10 · "RBAC real") ────────────────────────────────
//
// Evalúa si el actor del request tiene un permiso operativo. El permiso se
// expresa con el string canónico del TPV (ej. 'cancel_items'), que se mapea
// a la columna `canX` del Employee cargada en `req.user` por `authenticate`.
//
// Concede acceso si:
//   1. El rol es privilegiado (OWNER/ADMIN/SUPER_ADMIN), o
//   2. El empleado tiene el flag correspondiente en true (incluye el alias
//      legacy canDiscount → apply_discount), o
//   3. El request trae un override token válido (PIN de supervisor validado
//      por el backend vía POST /api/employees/verify-permission) para ese
//      mismo permiso y tenant.
function userHasPermission(req, permission) {
  if (PRIVILEGED_ROLES.includes(req.user?.role)) return true;
  const flag = PERM_TO_FLAG[permission];
  if (!flag) return false;
  if (req.user?.[flag]) return true;
  // Alias legacy: canDiscount también concede apply_discount.
  if (flag === 'canApplyDiscounts' && req.user?.canDiscount) return true;
  return false;
}

// Valida un override token (JWT corto firmado por el backend). El token debe
// ser para el mismo permiso y el mismo tenant del actor — así un override de
// otra sucursal/permiso no se reutiliza.
function hasValidOverride(req, permission) {
  const token = req.headers['x-override-token'];
  if (!token || typeof token !== 'string') return false;
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    return (
      p.override === true &&
      p.permission === permission &&
      (!req.user?.tenantId || p.tenantId === req.user.tenantId)
    );
  } catch {
    return false;
  }
}

// Middleware factory. Uso: requirePermission('cancel_items')
const requirePermission = (permission) => (req, res, next) => {
  if (userHasPermission(req, permission) || hasValidOverride(req, permission)) {
    return next();
  }
  return res.status(403).json({
    error: 'No tienes autorización para esta acción',
    code: 'PERMISSION_REQUIRED',
    requiredPermission: permission,
  });
};

module.exports = {
  authenticate,
  requireAdmin,
  requireSuperAdmin,
  requireRole,
  requireTenantAccess,
  requirePermission,
  userHasPermission,
  hasValidOverride,
  PRIVILEGED_ROLES,
};
