"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, History, RefreshCcw } from 'lucide-react';
import api from '@/lib/api';
import { historyChannel, historyState, type HistoryOrder } from '@/lib/order-history';

interface HistoryPage {
  orders: HistoryOrder[];
  nextCursor: string | null;
  context: { restaurantName: string; locationName: string };
  fetchedAt: string;
}
const control = 'min-h-[44px] rounded-xl border border-white/20 bg-[#202024] px-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-amber-300';
const date = (value: string) => new Date(value).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function OrderHistory() {
  const [days, setDays] = useState('30');
  const [state, setState] = useState('all');
  const [page, setPage] = useState<HistoryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const generation = useRef(0);
  const fetchPage = useCallback(async (cursor?: string) => {
    const version = ++generation.current;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<HistoryPage>('/api/kds/history', { params: { days, state, cursor } });
      if (version !== generation.current) return;
      setPage(previous => cursor && previous ? { ...data, orders: [...previous.orders, ...data.orders.filter(order => !previous.orders.some(old => old.id === order.id))] } : data);
    } catch {
      if (version === generation.current) setError('No se pudo actualizar el historial. Comprueba la conexión y vuelve a intentar.');
    } finally {
      if (version === generation.current) setLoading(false);
    }
  }, [days, state]);

  useEffect(() => {
    setPage(null);
    setExpanded(null);
    void fetchPage();
    return () => { generation.current++; };
  }, [fetchPage]);

  return <section aria-labelledby="history-title" className="mx-auto max-w-5xl">
    <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
      <div>
        <h1 id="history-title" className="flex items-center gap-2 text-xl font-black"><History size={22} /> Historial de pedidos</h1>
        {page?.context && <p className="mt-1 text-sm text-white/80">{page.context.restaurantName} · {page.context.locationName}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-white/80">Periodo <select aria-label="Periodo del historial" className={control + ' ml-2'} value={days} onChange={e => setDays(e.target.value)}>
          <option value="1">Últimas 24 horas</option><option value="7">Últimos 7 días</option><option value="30">Últimos 30 días</option><option value="90">Últimos 90 días</option>
        </select></label>
        <label className="text-sm text-white/80">Estado <select aria-label="Estado del pedido" className={control + ' ml-2'} value={state} onChange={e => setState(e.target.value)}>
          <option value="all">Todos los estados</option><option value="awaiting">Por aceptar / pago</option><option value="preparing">En cocina / empaque</option><option value="ready">Listos / en reparto</option><option value="closed">Entregados</option><option value="cancelled">Cancelados</option>
        </select></label>
        <button type="button" className={control + ' flex items-center gap-2 disabled:opacity-50'} disabled={loading} onClick={() => void fetchPage()}><RefreshCcw size={16} /> Actualizar</button>
      </div>
    </div>
    <p className="mb-4 rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white/80">Consulta de toda la sucursal, sin filtro por estación. Los pedidos por aceptar se gestionan en caja. Consultar un pedido aquí no lo vuelve a enviar a cocina.</p>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-500/15 p-3 text-red-200">{error}{page && ' Los datos visibles pueden estar desactualizados.'}</p>}
    <p role="status" className="mb-3 text-sm text-white/75">{loading ? 'Consultando pedidos…' : page ? `${page.orders.length} pedidos cargados · Actualizado ${date(page.fetchedAt)}` : 'Historial sin actualizar'}</p>
    {!loading && page?.orders.length === 0 && <p className="rounded-2xl border border-white/15 p-8 text-center text-white/80">No hay pedidos con este periodo y estado. Prueba un periodo más amplio o todos los estados.</p>}
    <div className="space-y-3" aria-busy={loading}>
      {page?.orders.map(order => {
        const status = historyState(order);
        const open = expanded === order.id;
        const table = order.table?.name || order.tableNumber;
        const quantity = order.items.reduce((total, item) => total + item.quantity, 0);
        const type = order.orderType === 'DELIVERY' ? 'A domicilio' : order.orderType === 'TAKEOUT' ? 'Para llevar' : 'En mesa';
        return <article key={order.id} className="overflow-hidden rounded-2xl border border-white/15 bg-white/5">
          <button type="button" aria-expanded={open} aria-controls={`history-${order.id}`} onClick={() => setExpanded(open ? null : order.id)} className="flex w-full min-h-[72px] items-center gap-4 p-4 text-left focus-visible:outline-2 focus-visible:outline-amber-300">
            <span className="text-lg font-black text-[#ffb84d]">#{order.orderNumber}</span>
            <span className="flex-1"><span className="block text-sm text-white/85">{date(order.createdAt)} · {historyChannel(order.source)} · {type}{table ? ` · Mesa ${table}` : ''}</span><span className="block mt-1 text-sm text-white/75">{quantity} {quantity === 1 ? 'producto' : 'productos'} · {open ? 'Ocultar detalle' : 'Ver detalle'}</span></span>
            <span className={'text-sm font-bold ' + status.tone}>{status.label}</span><ChevronDown size={18} className={open ? 'rotate-180' : ''} />
          </button>
          {open && <div id={`history-${order.id}`} className="border-t border-white/15 p-4">
            <p className={'mb-3 text-sm ' + status.tone}>{status.explanation}</p>
            <ul className="space-y-3">{order.items.map(item => <li key={item.id}>
              <p className="font-bold">{item.quantity} × {item.name}</p>
              {[...item.comboSelections, ...item.modifiers].map((extra, index) => <p key={index} className="text-sm text-white/80">· {extra.name}</p>)}
              {item.notes && <p className="text-sm text-amber-200">Nota: {item.notes}</p>}
            </li>)}</ul>
            {order.notes && <p className="mt-3 text-sm text-amber-200">Nota del pedido: {order.notes}</p>}
          </div>}
        </article>;
      })}
    </div>
    {page?.nextCursor && <button type="button" className={control + ' my-4 w-full disabled:opacity-50'} disabled={loading} onClick={() => void fetchPage(page.nextCursor!)}>Cargar más pedidos</button>}
  </section>;
}
