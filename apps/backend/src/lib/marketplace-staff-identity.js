'use strict';

// Include the specialized roles already authorized by Ops and settlements.
// Resolving a staff identity never grants role-derived permissions.
const STAFF_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'DISPATCHER', 'CASHIER', 'MERCHANT_OWNER',
  'SUPERVISOR', 'SUPPORT', 'FINANCE']);

class StaffIdentityError extends Error {
  constructor(code, message, statusCode = 401) {
    super(message); this.name = 'StaffIdentityError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code = 'INVALID_STAFF_IDENTITY', message = 'Identidad de personal invalida', status = 401) {
  if (!ok) throw new StaffIdentityError(code, message, status);
}
function identifier(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 128
    && !/[\x00-\x1f\x7f]/.test(value);
}
function normalizeActor(source) {
  check(source && typeof source === 'object' && !Array.isArray(source)
    && source.isActive !== false && source.isDevice !== true);
  const accountId = source.accountId ?? source.id ?? source.userId ?? source.sub;
  check(identifier(accountId) && !accountId.startsWith('guest:'));
  const suppliedRoles = source.roles ?? source.role;
  const roles = Array.isArray(suppliedRoles) ? suppliedRoles : [suppliedRoles];
  check(roles.length > 0 && roles.every(role => typeof role === 'string' && STAFF_ROLES.has(role.trim().toUpperCase())));
  const permissions = source.permissions ?? [];
  check(Array.isArray(permissions) && permissions.every(identifier));
  const actor = { id: accountId, accountId, roles: [...new Set(roles.map(role => role.trim().toUpperCase()))],
    permissions: [...new Set(permissions)], isActive: true, isDevice: false };
  // Only preserve trusted authorization scopes; omit profile, credentials and PII.
  for (const field of ['tenantId', 'restaurantId', 'locationId']) {
    if (source[field] !== undefined) {
      check(source[field] === null || identifier(source[field]));
      actor[field] = source[field];
    }
  }
  if (source.merchantIds !== undefined) {
    check(Array.isArray(source.merchantIds) && source.merchantIds.every(identifier));
    actor.merchantIds = [...new Set(source.merchantIds)];
  }
  return actor;
}

/** Local-only identity bridge. req.user must be populated by trusted middleware.
 * Otherwise verify a staff Bearer JWT using HS256, expiry and activation time.
 * verifyToken is an optional trusted verification port, never a decode-only port.
 * No auth middleware, database, dotenv or network imports are needed.
 */
function createStaffActorResolver({ verifyToken,
  jwtSecret = () => process.env.MARKETPLACE_STAFF_JWT_SECRET || process.env.JWT_SECRET,
  now = () => new Date() } = {}) {
  return async req => {
    // A rejected middleware identity must not fall back to another credential.
    if (req.user !== undefined && req.user !== null) return normalizeActor(req.user);
    const authorization = req.headers?.authorization;
    if (authorization === undefined) return null;
    check(typeof authorization === 'string' && /^Bearer [^\s]+$/i.test(authorization));
    const token = authorization.slice(7);
    check(token.length <= 8192);
    const at = now();
    check(at instanceof Date && Number.isFinite(at.getTime()), 'STAFF_AUTH_UNAVAILABLE', 'Reloj de autenticacion no disponible', 503);
    const timestamp = at.getTime() / 1000;
    let claims;
    try {
      if (verifyToken) claims = await verifyToken(token);
      else {
        const secret = jwtSecret();
        check(typeof secret === 'string' && secret.length > 0, 'STAFF_AUTH_UNAVAILABLE', 'Autenticacion de personal no configurada', 503);
        claims = require('jsonwebtoken').verify(token, secret, { algorithms: ['HS256'], clockTimestamp: timestamp });
      }
    } catch (error) {
      if (error instanceof StaffIdentityError) throw error;
      throw new StaffIdentityError('INVALID_STAFF_IDENTITY', 'Token de personal invalido');
    }
    check(claims && typeof claims === 'object' && !Array.isArray(claims)
      && Number.isFinite(claims.exp) && claims.exp > timestamp
      && (claims.nbf === undefined || Number.isFinite(claims.nbf) && claims.nbf <= timestamp));
    return normalizeActor(claims);
  };
}

module.exports = { StaffIdentityError, createStaffActorResolver };
