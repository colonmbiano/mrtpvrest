import { NextResponse } from 'next/server';
import { getPublicTestCatalog, isTestStoreSlug, priceTestOrder, TestOrderError } from '@/lib/marketplace-test-order';
import { canUseLocalTestOrders, isLoopbackRequest, persistTestOrder } from '@/lib/marketplace-test-storage';

export const dynamic = 'force-dynamic';

const response = (body: unknown, status: number) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });

export async function POST(req: Request) {
  if (!canUseLocalTestOrders() || !isLoopbackRequest(req)) {
    return response({ error: 'No disponible fuera del desarrollo local' }, 404);
  }
  const origin = req.headers.get('origin');
  if (origin !== 'http://' + req.headers.get('host') || req.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return response({ error: 'ORIGEN_INVALIDO' }, 403);
  }
  const bodyText = await req.text();
  if (bodyText.length > 12000) return response({ error: 'SOLICITUD_EXCESIVA' }, 413);
  let body: unknown;
  try { body = JSON.parse(bodyText); } catch { return response({ error: 'JSON_INVALIDO' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: 'ORDEN_INVALIDA' }, 400);
  const orderBody = body as Record<string, unknown>;
  if (typeof orderBody.slug !== 'string' || !isTestStoreSlug(orderBody.slug)) {
    return response({ error: 'TIENDA_INVALIDA' }, 400);
  }
  try {
    // Reconsultamos el menu publico para que el navegador no establezca precios.
    const store = await getPublicTestCatalog(orderBody.slug);
    const priced = priceTestOrder(store, orderBody.items);
    const order = await persistTestOrder({
      slug: store.slug, storeName: store.name, status: 'TEST_CREATED', pickup: true, ...priced,
    });
    return response({ id: order.id, totalCents: order.totalCents, status: order.status }, 201);
  } catch (error) {
    if (error instanceof TestOrderError) return response({ error: error.code }, 400);
    return response({ error: 'No se pudo validar el menu publico o guardar la orden de prueba' }, 503);
  }
}
