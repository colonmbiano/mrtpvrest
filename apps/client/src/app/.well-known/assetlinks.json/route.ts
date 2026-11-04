import { isMarketplaceCatalogEnabled } from '@/lib/config';

// Digital Asset Links de la app Android del marketplace (apps/client/android). Con
// esto Chrome confía en la app y la abre a pantalla completa, sin barra de dirección
// (Trusted Web Activity), y Android le manda los enlaces al marketplace.
//
// MARKETPLACE_ANDROID_CERT_SHA256: huellas SHA-256 de los certificados que firman la
// app, separadas por comas (la de firma de Play y la de subida). Sin huellas, 404: la
// app abre igual, pero con la barra de dirección de Chrome.
const PACKAGE_NAME = 'com.mrtpvrest.marketplace';
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export const dynamic = 'force-dynamic';

export function GET() {
  const fingerprints = (process.env.MARKETPLACE_ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map(value => value.trim().toUpperCase())
    .filter(value => FINGERPRINT.test(value));
  if (!isMarketplaceCatalogEnabled() || fingerprints.length === 0) {
    return new Response('Not found', { status: 404 });
  }
  const statements = [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: PACKAGE_NAME, sha256_cert_fingerprints: fingerprints },
  }];
  return Response.json(statements, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
