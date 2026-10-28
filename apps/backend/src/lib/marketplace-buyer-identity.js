'use strict';

const crypto = require('node:crypto');

class BuyerIdentityError extends Error {
  constructor(code, message, statusCode = 401) {
    super(message); this.name = 'BuyerIdentityError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code = 'INVALID_BUYER_IDENTITY', message = 'Identidad de comprador invalida', status = 401) {
  if (!ok) throw new BuyerIdentityError(code, message, status);
}
function identifier(value, max = 128) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= max
    && !/[\x00-\x1f\x7f]/.test(value);
}

// Raw header identifiers are guest-session handles, NEVER signed account claims.
// Both explicit guest headers share this namespace so a guest quote can later be
// consumed using X-Buyer-Id. Reserved prefixes cannot impersonate a real account.
function guestAccount(value) {
  return `guest:${crypto.createHash('sha256').update(JSON.stringify(['marketplace-guest', value])).digest('hex').slice(0, 58)}`;
}

/** Local-only resolver: no auth middleware, database, network or dotenv import.
 * Bearer accepts HS256 CUSTOMER/BUYER JWTs: marketplace buyer tokens (dedicated
 * key, issuer and audience; lib/marketplace-jwt.js) and, during the transition,
 * storefront session JWTs (jwtSecret, without issuer/audience).
 * jwtSecret/marketplaceSecret/verifyToken/now are injectable for offline fixtures.
 * A custom resolveAccount on either router still overrides this default completely.
 * IP/UA fingerprints are quote-only correlation, not authenticated identities.
 */
function createBuyerAccountResolver({ allowGuest = false, verifyToken,
  jwtSecret = () => require('./marketplace-jwt').storeSecret(process.env),
  marketplaceSecret = () => require('./marketplace-jwt').dedicatedSecret('buyer', process.env),
  now = () => new Date() } = {}) {
  function at() {
    const value = now();
    check(value instanceof Date && Number.isFinite(value.getTime()), 'BUYER_AUTH_UNAVAILABLE', 'Reloj de autenticacion no disponible', 503);
    return value.getTime();
  }
  return async req => {
    const headers = req.headers || {};
    if (headers.authorization !== undefined) {
      check(typeof headers.authorization === 'string' && /^Bearer [^\s]+$/i.test(headers.authorization));
      const token = headers.authorization.slice(7);
      check(token.length <= 8192);
      let claims;
      try {
        if (verifyToken) claims = await verifyToken(token);
        else {
          const usable = value => (typeof value === 'string' && value.length > 0 ? value : undefined);
          const dedicated = usable(marketplaceSecret());
          const store = usable(jwtSecret());
          check(dedicated || store, 'BUYER_AUTH_UNAVAILABLE', 'Autenticacion de comprador no configurada', 503);
          claims = require('./marketplace-jwt').verifyMarketplaceToken('buyer', token, { marketplaceSecret: dedicated,
            storeSecret: store, clockTimestamp: Math.floor(at() / 1000) });
        }
      } catch (error) {
        if (error instanceof BuyerIdentityError) throw error;
        throw new BuyerIdentityError('INVALID_BUYER_IDENTITY', 'Token de comprador invalido');
      }
      check(claims && typeof claims === 'object' && !Array.isArray(claims)
        && ['CUSTOMER', 'BUYER'].includes(claims.role) && claims.isDevice !== true && claims.isActive !== false
        && Number.isFinite(claims.exp) && claims.exp * 1000 > at()
        && (claims.nbf === undefined || Number.isFinite(claims.nbf) && claims.nbf * 1000 <= at()));
      const accountId = claims.accountId ?? claims.buyerId ?? claims.userId ?? claims.sub ?? claims.id;
      check(identifier(accountId, 64) && !accountId.startsWith('guest:'));
      return accountId;
    }
    if (headers['x-buyer-id'] !== undefined) {
      check(identifier(headers['x-buyer-id']));
      return guestAccount(headers['x-buyer-id']);
    }
    if (!allowGuest) return null;
    if (headers['x-guest-id'] !== undefined) {
      check(identifier(headers['x-guest-id']));
      return guestAccount(headers['x-guest-id']);
    }
    // Read the peer address, not a caller-controlled X-Forwarded-For header.
    const ip = req.socket?.remoteAddress || req.ip;
    const ua = typeof headers['user-agent'] === 'string' ? headers['user-agent'].slice(0, 512) : '';
    // An incomplete test/request surface without a peer must not share a global
    // guest identity. Real Express requests always have a socket/remote address.
    const fingerprint = typeof ip === 'string' && ip ? ['peer', ip.slice(0, 64), ua] : ['unresolved', crypto.randomUUID()];
    return guestAccount(fingerprint);
  };
}

module.exports = { BuyerIdentityError, createBuyerAccountResolver };
