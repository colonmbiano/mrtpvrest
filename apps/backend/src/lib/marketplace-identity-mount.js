'use strict';

// Decide si se monta /api/marketplace/identity (cuenta global del comprador).
//   - Apagada salvo MARKETPLACE_IDENTITY_ENABLED=true.
//   - staging: igual que antes; mal configurada detiene el arranque (entorno aislado).
//   - production: solo cuentas de comprador. Mal configurada NO se monta y se
//     registra el motivo: una bandera a medias no debe tumbar el backend.
// Nunca devuelve ni registra valores de variables, solo sus nombres.
const { dedicatedSecret } = require('./marketplace-jwt');

const PRODUCTION_ROLES = Object.freeze(['BUYER']);

function sameSiteOrigin(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  // La cookie __Host- es del host de la API: la tienda tiene que ser del mismo
  // sitio (mrtpvrest.com) para que el navegador la mande, y CORS ya la admite.
  const host = url.hostname;
  return url.protocol === 'https:' && url.origin === value && !url.username && !url.password
    && (host === 'mrtpvrest.com' || host.endsWith('.mrtpvrest.com'));
}

function resolveIdentityMount(env = process.env) {
  if (env.MARKETPLACE_IDENTITY_ENABLED !== 'true') return { mount: false };
  const mode = env.MARKETPLACE_IDENTITY_MODE;

  if (mode === 'staging') {
    const database = (() => { try { return new URL(env.DATABASE_URL || ''); } catch { return null; } })();
    if (!database || !/marketplace.*staging/i.test(decodeURIComponent(database.pathname))
      || !env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY
      || !/^https:\/\//.test(env.MARKETPLACE_IDENTITY_ORIGIN || '')) {
      throw new Error('Marketplace identity can only run in configured isolated staging');
    }
    return { mount: true, mode, roles: null };
  }

  if (mode === 'production') {
    const missing = [];
    if (!env.RESEND_API_KEY) missing.push('RESEND_API_KEY');
    if (!env.TURNSTILE_SECRET_KEY) missing.push('TURNSTILE_SECRET_KEY');
    if (!sameSiteOrigin(env.MARKETPLACE_IDENTITY_ORIGIN || '')) missing.push('MARKETPLACE_IDENTITY_ORIGIN');
    if (!dedicatedSecret('buyer', env)) missing.push('MARKETPLACE_BUYER_JWT_SECRET');
    if (missing.length) return { mount: false, mode, reason: 'missing_or_invalid', missing };
    return { mount: true, mode, roles: PRODUCTION_ROLES };
  }

  throw new Error('MARKETPLACE_IDENTITY_MODE must be staging or production');
}

module.exports = { resolveIdentityMount, PRODUCTION_ROLES };
