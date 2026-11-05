'use strict';

// Verifica un Bearer JWT de repartidor (clave dedicada + emisor + destinatario,
// lib/marketplace-jwt.js contexto 'courier'). Es el camino de autenticacion para
// apps nativas (APK) que NO pueden enviar la cookie same-site de identidad a la
// API cross-site. No crea identidades ni toca la BD: solo traduce un token valido
// en un actor con rol COURIER (la verificacion de MarketplaceNetworkCourier
// ACTIVE/VERIFIED la hacen las rutas que lo consumen).
//
// Devuelve null cuando no hay Authorization, no es un Bearer, no es un token de
// courier o no se puede verificar, para que el resolver de red pueda intentar otra
// credencial (p. ej. un token de tienda/dueno) sin fallar en seco.

// Vigencia del token de courier. Mas largo que el de comprador (15m, refrescado
// por cookie) porque el APK no tiene cookie para renovarlo; el cliente vuelve a
// loguearse al expirar (401), igual que con el accessToken actual del repartidor.
const COURIER_TOKEN_TTL_S = 24 * 60 * 60;

function createCourierActorResolver({ verifyToken,
  marketplaceSecret = () => require('./marketplace-jwt').dedicatedSecret('courier', process.env),
  now = () => new Date() } = {}) {
  return async req => {
    const authorization = req.headers?.authorization;
    if (typeof authorization !== 'string' || !/^Bearer [^\s]+$/i.test(authorization)) return null;
    const token = authorization.slice(7);
    if (token.length > 8192) return null;
    const at = now();
    if (!(at instanceof Date) || !Number.isFinite(at.getTime())) return null;
    const timestamp = at.getTime() / 1000;
    let claims;
    try {
      if (verifyToken) {
        claims = await verifyToken(token);
      } else {
        const secret = marketplaceSecret();
        if (!secret) return null;
        claims = require('./marketplace-jwt').verifyMarketplaceToken('courier', token,
          { marketplaceSecret: secret, clockTimestamp: timestamp });
      }
    } catch {
      // No es un token de courier valido: deja que otra credencial lo intente.
      return null;
    }
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) return null;
    if (claims.role !== 'COURIER') return null;
    const accountId = claims.accountId ?? claims.sub;
    if (typeof accountId !== 'string' || !accountId || accountId.length > 128) return null;
    if (!Number.isFinite(claims.exp) || claims.exp <= timestamp) return null;
    if (claims.nbf !== undefined && (!Number.isFinite(claims.nbf) || claims.nbf > timestamp)) return null;
    return { id: accountId, accountId, roles: ['COURIER'], isActive: true, isDevice: false };
  };
}

module.exports = { createCourierActorResolver, COURIER_TOKEN_TTL_S };
