'use strict';

// Confianza JWT del marketplace (G8): un contexto por tipo de sesión, cada uno con
// su clave, emisor y destinatario explícitos.
//   buyer  MARKETPLACE_BUYER_JWT_SECRET  aud 'mrtpvrest-marketplace-buyer'
//   staff  MARKETPLACE_STAFF_JWT_SECRET  aud 'mrtpvrest-marketplace-staff'
// La clave dedicada solo vale con 32+ bytes y distinta de JWT_SECRET/JWT_REFRESH_SECRET:
// un token del marketplace nunca abre la tienda ni el otro contexto.
//
// Transición: hoy ningún flujo emite tokens del marketplace; los compradores y el
// personal llegan con el JWT de la tienda (JWT_SECRET). Ese token se sigue aceptando
// solo si no trae emisor ni destinatario (las sesiones de la tienda no los llevan;
// los tokens de otro propósito, como los respaldos retail, sí).
// MARKETPLACE_ACCEPT_STORE_JWT=false lo retira cuando exista el emisor propio.

const jwt = require('jsonwebtoken');

const ISSUER = 'mrtpvrest-marketplace';
const CONTEXTS = {
  buyer: { secretEnv: 'MARKETPLACE_BUYER_JWT_SECRET', audience: 'mrtpvrest-marketplace-buyer' },
  staff: { secretEnv: 'MARKETPLACE_STAFF_JWT_SECRET', audience: 'mrtpvrest-marketplace-staff' },
};

function context(kind) {
  const found = CONTEXTS[kind];
  if (!found) throw new Error(`Contexto JWT desconocido: ${kind}`);
  return found;
}

// Clave dedicada del contexto, o undefined si falta o no es segura.
function dedicatedSecret(kind, env = process.env) {
  const secret = env[context(kind).secretEnv];
  return typeof secret === 'string' && Buffer.byteLength(secret) >= 32
    && secret !== env.JWT_SECRET && secret !== env.JWT_REFRESH_SECRET ? secret : undefined;
}

// Clave del JWT de la tienda mientras dure la transición.
function storeSecret(env = process.env) {
  return env.MARKETPLACE_ACCEPT_STORE_JWT === 'false' ? undefined : env.JWT_SECRET;
}

// Emite un token del marketplace. Sin clave dedicada no firma: nunca con JWT_SECRET.
function signMarketplaceToken(kind, claims, { env = process.env, expiresIn = '15m' } = {}) {
  const secret = dedicatedSecret(kind, env);
  if (!secret) throw new Error(`${context(kind).secretEnv} requerido (32+ bytes, distinto de JWT_SECRET)`);
  return jwt.sign(claims, secret, { algorithm: 'HS256', issuer: ISSUER, audience: context(kind).audience, expiresIn });
}

/** Verifica un token para el contexto. Primero como token del marketplace (clave
 * dedicada + emisor + destinatario); si no, como sesión de la tienda durante la
 * transición. Cualquier rechazo lanza (error de jsonwebtoken o Error); quien llama
 * lo traduce y antes comprueba que haya al menos una clave.
 */
function verifyMarketplaceToken(kind, token, { marketplaceSecret, storeSecret: store, clockTimestamp } = {}) {
  const { audience } = context(kind);
  let failure = new Error('Sin clave para verificar el token');
  if (marketplaceSecret) {
    try {
      return jwt.verify(token, marketplaceSecret, { algorithms: ['HS256'], issuer: ISSUER, audience, clockTimestamp });
    } catch (error) { failure = error; }
  }
  if (store) {
    const claims = jwt.verify(token, store, { algorithms: ['HS256'], clockTimestamp });
    // Las sesiones de la tienda no traen emisor ni destinatario: un token con ellos es
    // de otro propósito, o un token "del marketplace" firmado con la clave de la tienda.
    if (claims && typeof claims === 'object' && (claims.iss !== undefined || claims.aud !== undefined)) {
      throw new Error('Token con emisor o destinatario ajeno a una sesión de la tienda');
    }
    return claims;
  }
  throw failure;
}

module.exports = { ISSUER, CONTEXTS, dedicatedSecret, storeSecret, signMarketplaceToken, verifyMarketplaceToken };
