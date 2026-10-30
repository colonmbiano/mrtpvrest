import { NextResponse } from 'next/server';
import { quoteMultiTestOrder } from '@/lib/marketplace-multi-order';
import { TestOrderError } from '@/lib/marketplace-test-order';
import { canUseLocalTestOrders, isLoopbackRequest, persistMultiTestOrder } from '@/lib/marketplace-test-storage';

export const dynamic = 'force-dynamic';
const answer = (data: unknown, status: number) => NextResponse.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' },
});
export async function POST(req: Request) {
  if (!canUseLocalTestOrders() || !isLoopbackRequest(req)) return answer({ error: 'NO_DISPONIBLE' }, 404);
  if (req.headers.get('origin') !== 'http://' + req.headers.get('host')
    || req.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    return answer({ error: 'ORIGEN_INVALIDO' }, 403);
  }
  const text = await req.text();
  if (text.length > 24000) return answer({ error: 'SOLICITUD_EXCESIVA' }, 413);
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return answer({ error: 'JSON_INVALIDO' }, 400); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return answer({ error: 'ORDEN_INVALIDA' }, 400);
  }
  const body = payload as Record<string, unknown>;
  try {
    // Valida TODOS los artículos y recalcula ambas tiendas antes de guardar.
    // El carrito del navegador nunca decide importes ni tiendas autorizadas.
    const quote = await quoteMultiTestOrder(body.items);
    const saved = await persistMultiTestOrder({
      totalCents: quote.totalCents,
      orders: quote.stores.map(s => ({
        id: '', slug: s.slug, storeName: s.storeName,
        subtotalCents: s.subtotalCents, lines: s.lines, status: 'TEST_CREATED',
      })),
    });
    return answer({
      id: saved.id, status: saved.status, totalCents: saved.totalCents,
      orders: saved.orders.map(o => ({
        id: o.id, slug: o.slug, subtotalCents: o.subtotalCents, status: o.status,
      })),
    }, 201);
  } catch (e) {
    if (e instanceof TestOrderError) return answer({ error: e.code }, 400);
    return answer({ error: 'NO_SE_PUDO_VALIDAR_O_GUARDAR_LA_COMPRA' }, 503);
  }
}
