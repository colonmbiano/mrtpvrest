'use client';
// Billetera del repartidor independiente (C8). Se lleva el 100% del envío y se le paga cada día:
// por cada comercio y día muestra cuánto ganó y quién le paga a quién.
import React, { useCallback, useEffect, useState } from 'react';
import { Wallet as WalletIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { C, S } from '@/lib/tokens';
import { dayLabel, formatCents, loadWallet, settlementText, type Wallet } from '@/lib/courierWallet';

export function CourierWallet({ refreshKey = 0 }: { refreshKey?: number }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setWallet(await loadWallet(14)); }
    catch (e) {
      setError((e as { code?: string })?.code === 'NETWORK' ? 'Sin conexión. No se pudieron cargar tus ganancias.' : 'No se pudieron cargar tus ganancias.');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, refreshKey]);

  return (
    <section aria-labelledby="wallet-title" style={S.card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <WalletIcon size={18} color={C.green} />
        <strong id="wallet-title" style={{ fontSize: 15, flex: 1 }}>Mis ganancias</strong>
        <button onClick={() => void load()} disabled={loading} style={{ ...S.btnSecondary, height: 32, padding: '0 12px', fontSize: 12 }}>
          {loading ? '…' : 'Actualizar'}
        </button>
      </div>
      {error && <p role="alert" style={{ margin: 0, color: C.coral, fontSize: 13 }}>{error}</p>}
      {loading && !wallet && <p role="status" style={{ margin: 0, color: C.textDim, fontSize: 13 }}>Cargando…</p>}
      {wallet && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {[
              ['Hoy', formatCents(wallet.totals.todayEarningsCents)],
              ['Últimos 14 días', formatCents(wallet.totals.periodEarningsCents)],
              ['Te deben', formatCents(wallet.totals.pendingFromMerchantsCents)],
              ['Debes entregar', formatCents(wallet.totals.owedToMerchantsCents)],
            ].map(([label, value]) => (
              <div key={label} style={{ background: C.surf2, borderRadius: 12, padding: '10px 12px' }}>
                <div style={{ fontSize: 11, color: C.textDim }}>{label}</div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: C.textDim, lineHeight: 1.5 }}>
            Te quedas con todo el envío. En efectivo cobras el total, te quedas tu envío y entregas el resto a la tienda;
            en pagos en línea la tienda te paga el envío. Cada día se salda en un solo movimiento.
          </p>
          {wallet.days.every(day => day.items.length === 0) && (
            <p style={{ margin: 0, fontSize: 13, color: C.textDim }}>Aún no tienes entregas en estos días.</p>
          )}
          {wallet.days.filter(day => day.items.length).map(day => (
            <div key={day.businessDate} style={{ marginBottom: 10 }}>
              <div style={S.sectionLabel}>{dayLabel(day.businessDate, wallet.today)}</div>
              {day.items.map(item => {
                const key = `${day.businessDate}|${item.restaurantId}`;
                const expanded = open === key;
                return (
                  <div key={key} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginTop: 6 }}>
                    <button onClick={() => setOpen(expanded ? null : key)} aria-expanded={expanded}
                      style={{ all: 'unset', cursor: 'pointer', display: 'flex', width: '100%', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{item.restaurantName ?? 'Comercio'}</div>
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          {item.deliveriesCount} entrega(s) · ganaste {formatCents(item.earningsCents)}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2,
                          color: item.status === 'PAID' ? C.green : item.direction === 'COURIER_PAYS' ? C.warn : C.iris }}>
                          {item.status === 'OPEN' ? 'Hoy (en curso): ' : ''}{settlementText(item)}
                        </div>
                      </div>
                      {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    {expanded && (
                      <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, fontSize: 12 }}>
                        {item.lines.map(line => (
                          <li key={line.orderId} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderTop: `1px solid ${C.border}` }}>
                            <span>{line.orderNumber ?? line.orderId.slice(0, 8)} · {line.paymentMethod === 'CASH' ? `efectivo ${formatCents(line.cashCollectedCents)}` : 'en línea'}</span>
                            <strong>{formatCents(line.earningsCents)}</strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </section>
  );
}
