/**
 * Test orders never reach a real restaurant, TPV, KDS or payment gateway.
 * Local JSON files, one per unguessable ID, no PII.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TestOrder } from './marketplace-test-order';

export const canUseLocalTestOrders = (): boolean =>
  process.env.NODE_ENV === 'development'
  && process.env.NEXT_PUBLIC_MARKETPLACE_ISOLATED === 'true'
  && process.env.MARKETPLACE_LIVE_PREVIEW === 'true';

export const isLoopbackRequest = (request: Request): boolean => {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';
  // Next dev puede normalizar req.url a localhost aunque el Host real sea
  // 127.0.0.1. Ambos deben ser loopback y el POST verifica Origin == Host.
  return url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1):[0-9]{2,5}$/.test(host)
    && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
};

const directory = () => path.resolve(process.cwd(), '..', '..', '.marketplace-local', 'pedidos-prueba');

export async function persistTestOrder(order: Omit<TestOrder, 'id' | 'createdAt'>): Promise<TestOrder> {
  if (!canUseLocalTestOrders()) throw new Error('DISABLED');
  const id = randomBytes(20).toString('hex');
  const complete: TestOrder = { ...order, id, createdAt: new Date().toISOString() };
  await mkdir(directory(), { recursive: true });
  await writeFile(path.join(directory(), id + '.json'), JSON.stringify(complete, null, 2), {
    encoding: 'utf8', flag: 'wx',
  });
  return complete;
}

export async function readTestOrder(id: string): Promise<TestOrder | null> {
  if (!canUseLocalTestOrders() || !/^[a-f0-9]{40}$/.test(id)) return null;
  try {
    const raw = await readFile(path.join(directory(), id + '.json'), 'utf8');
    const row = JSON.parse(raw) as TestOrder;
    return row.id === id && row.status === 'TEST_CREATED' ? row : null;
  } catch { return null; }
}
