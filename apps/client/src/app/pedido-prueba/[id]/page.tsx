import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { readTestOrder, canUseLocalTestOrders } from '@/lib/marketplace-test-storage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Pedido de prueba registrado | MRTPVREST',
  robots: { index: false, follow: false },
};
const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);

export default async function TestOrderReceipt({ params }: {
  params: Promise<{ id: string }>;
}) {
  if (!canUseLocalTestOrders()) notFound();
  const { id } = await params;
  const order = await readTestOrder(id);
  if (!order) notFound();

  return <main className="min-h-screen bg-green-50 px-4 py-12 text-slate-900">
    <div className="mx-auto max-w-xl rounded-3xl border border-green-200 bg-white p-6 shadow-xl sm:p-9">
      <div className="mb-4 text-center text-6xl" aria-hidden="true">✅</div>
      <h1 className="text-center text-3xl font-black">¡Pedido de prueba creado!</h1>
      <p className="mt-3 text-center text-sm text-slate-500">
        Número de prueba: <strong>{order.id.slice(0, 10).toUpperCase()}</strong>
      </p>
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>SIMULACIÓN LOCAL · NO ES UN PEDIDO REAL.</strong>
        <p className="mt-1">Esta orden se guardó exclusivamente en tu PC.
        No llegó a Master Burguer’s ni a Tokki Boba, no se asignó repartidor y no se realizó ningún cobro.</p>
      </div>
      <div className="mt-6 space-y-2">
        <p className="text-sm text-slate-500">Negocio</p>
        <h2 className="text-xl font-black">{order.storeName}</h2>
        <p className="text-sm text-slate-500">Estado: recibida en el simulador · para recoger (prueba)</p>
      </div>
      <section aria-label="Detalle del pedido" className="mt-6 space-y-3 border-t pt-5">
        {order.lines.map((line, i) => (
          <div key={i} className="flex justify-between gap-4">
            <div><strong className="text-sm">{line.quantity} × {line.name}</strong>
              {line.variant && <p className="text-xs text-slate-500">{line.variant}</p>}
              {line.modifiers.length > 0 && <p className="text-xs text-slate-500">{line.modifiers.join(', ')}</p>}
            </div>
            <span className="text-sm font-extrabold">{money(line.lineCents)}</span>
          </div>
        ))}
      </section>
      <div className="mt-6 flex justify-between border-t pt-4 text-xl font-black">
        <span>Total calculado</span><span>{money(order.totalCents)}</span>
      </div>
      <p className="mt-4 text-xs text-slate-500">Guardado el {new Date(order.createdAt).toLocaleString('es-MX')}.</p>
      <div className="mt-7 grid gap-3 sm:grid-cols-2">
        <Link href={'/comercio/' + order.slug} className="rounded-xl bg-orange-600 px-4 py-3 text-center font-bold text-white">
          Hacer otra prueba
        </Link>
        <Link href="/" className="rounded-xl border border-green-700 px-4 py-3 text-center font-bold text-green-800">
          Volver al Marketplace
        </Link>
      </div>
    </div>
  </main>;
}
