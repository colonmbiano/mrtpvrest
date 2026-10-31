import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { canUseLocalTestOrders, readMultiTestOrder } from '@/lib/marketplace-test-storage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Compra multi-tienda de prueba | MRTPVREST', robots: { index: false, follow: false },
};
const money = (cents: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(cents / 100);
export default async function MultiReceipt({ params }: { params: Promise<{ id: string }> }) {
  if (!canUseLocalTestOrders()) notFound();
  const { id } = await params;
  const purchase = await readMultiTestOrder(id);
  if (!purchase) notFound();

  return <main className="min-h-screen bg-[#f3f8f3] px-4 py-10 text-slate-900">
    <div className="mx-auto max-w-2xl rounded-3xl border border-green-100 bg-white p-5 shadow-xl sm:p-9">
      <div className="text-center text-6xl" aria-hidden="true">✅</div>
      <h1 className="mt-3 text-center text-2xl font-black sm:text-3xl">¡Compra multi-tienda creada!</h1>
      <p className="mt-2 text-center text-sm text-slate-500">
        Compra de prueba <strong>#{purchase.id.slice(0, 10).toUpperCase()}</strong>
      </p>
      <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>SIMULACIÓN LOCAL, NO ES UNA COMPRA REAL.</strong>
        Se guardaron {purchase.orders.length} órdenes de prueba, una por negocio.
        No se enviaron a TPV ni cocina. No hubo cobro, reparto ni descuento de inventario.
      </p>
      <div className="mt-6 space-y-5">
        {purchase.orders.map((order, index) =>
          <section className="rounded-2xl border border-slate-200 p-4 sm:p-5" key={order.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold uppercase text-green-700">Orden {index + 1} de {purchase.orders.length}</p>
                <h2 className="mt-1 text-xl font-extrabold">{order.storeName}</h2>
                <p className="mt-1 text-xs text-slate-500">ID de tienda: {order.id.slice(0, 10).toUpperCase()}</p>
              </div>
              <span className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-900">
                Pendiente solo en simulador
              </span>
            </div>
            <div className="mt-4 space-y-3 border-t pt-4">
              {order.lines.map((line, i) =>
                <div key={i} className="flex items-start justify-between gap-3">
                  <div className="text-sm">
                    <strong>{line.quantity} × {line.name}</strong>
                    {line.variant && <p className="text-xs text-slate-500">{line.variant}</p>}
                    {line.modifiers.length > 0 && <p className="text-xs text-slate-500">{line.modifiers.join(', ')}</p>}
                  </div>
                  <span className="shrink-0 text-sm font-bold">{money(line.lineCents)}</span>
                </div>)}
            </div>
            <div className="mt-4 flex justify-between border-t pt-3 font-extrabold">
              <span>Subtotal de {order.storeName}</span><span>{money(order.subtotalCents)}</span>
            </div>
          </section>)}
      </div>
      <div className="mt-6 space-y-2 border-t pt-5 text-sm">
        <div className="flex justify-between text-slate-500"><span>Envío</span><span>No calculado · prueba</span></div>
        <div className="flex justify-between text-slate-500"><span>Método de pago</span><span>Sin cobro</span></div>
        <div className="flex justify-between text-xl font-black">
          <span>Total de productos</span><span>{money(purchase.totalCents)}</span>
        </div>
      </div>
      <p className="mt-5 text-xs text-slate-500">
        Guardado en este PC el {new Date(purchase.createdAt).toLocaleString('es-MX')}.
      </p>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Link href="/comercio/master-burguer-s" className="flex-1 rounded-xl bg-orange-600 px-4 py-3 text-center font-bold text-white">
          Probar otra compra
        </Link>
        <Link href="/" className="flex-1 rounded-xl border border-green-700 px-4 py-3 text-center font-bold text-green-800">
          Volver al Marketplace
        </Link>
      </div>
    </div>
  </main>;
}
