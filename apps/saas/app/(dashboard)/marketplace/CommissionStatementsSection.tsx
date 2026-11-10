'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { commissionError, formatCents, issueStatement, loadCommissionList, monthLabel, nextAction, paymentInputError,
  payStatement, recentPeriods, statusLabel, type CommissionList, type CommissionStatement } from '@/lib/marketplaceCommissions';

const controlStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'var(--surf-1)', color: 'var(--tx)' };
const cellStyle = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13 };

// C5: comisión de pedidos del Mercadito pagados en efectivo, por comercio y por mes.
export function CommissionStatementsSection() {
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [data, setData] = useState<CommissionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void loadCommissionList(api, { period, signal: controller.signal })
      .then(list => { if (!controller.signal.aborted) setData(list); })
      .catch(err => { if (!controller.signal.aborted) setError(commissionError(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [period, refresh]);

  async function run(item: CommissionStatement, work: () => Promise<void>, done: string) {
    setBusy(item.restaurantId); setError(''); setNotice('');
    try { await work(); setNotice(done); setPaying(null); setReference(''); setNote(''); setRefresh(value => value + 1); }
    catch (err) { setError(err instanceof Error && !('response' in err) ? err.message : commissionError(err)); }
    finally { setBusy(null); }
  }

  const periods = data ? recentPeriods(data.currentPeriod, 12) : [];
  const selected = data?.period ?? period ?? '';
  const paymentProblem = paying ? paymentInputError(reference, note) : null;
  return (
    <section aria-labelledby="commissions-title" style={{ marginBottom: 32 }}>
      <h2 id="commissions-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Comisiones por cobrar (efectivo)</h2>
      <p style={{ fontSize: 13, color: 'var(--tx-mut)', maxWidth: 720 }}>
        En pedidos en efectivo el comercio cobra todo; la comisión del Mercadito se le cobra al mes. Solo cuentan pedidos entregados;
        los cancelados no cobran. Un mes cerrado se emite (queda congelado) y luego se marca pagado con la referencia.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label htmlFor="commissions-period">Mes</label>
        <select id="commissions-period" value={selected} onChange={event => setPeriod(event.target.value)} style={controlStyle} disabled={!data}>
          {periods.map(value => <option key={value} value={value}>{monthLabel(value)}{value === data?.currentPeriod ? ' (en curso)' : ''}</option>)}
        </select>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} style={controlStyle}>Actualizar</button>
      </div>
      {data && <dl style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 12 }}>
        {[
          ['Comisión del mes', formatCents(data.totals.commissionCents)], ['Por emitir', formatCents(data.totals.unissuedCents)],
          ['Emitido · por cobrar', formatCents(data.totals.issuedCents)], ['Pagado', formatCents(data.totals.paidCents)],
          ['Comercios', String(data.totals.merchants)],
        ].map(([label, value]) => <div key={label}><dt style={{ fontSize: 12, color: 'var(--tx-mut)' }}>{label}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{value}</dd></div>)}
      </dl>}
      {notice && <p role="status" style={{ padding: 12, marginBottom: 12, background: 'rgba(34,197,94,0.12)', borderRadius: 8 }}>{notice}</p>}
      {error && <div role="alert" style={{ padding: 16, marginBottom: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
        <p style={{ margin: 0 }}>{error}</p>
      </div>}
      <div style={{ background: 'var(--surf-1)', border: '1px solid var(--bd-1)', borderRadius: 12, overflowX: 'auto' }} aria-busy={loading}>
        {loading && !data ? <p role="status" style={{ padding: 24 }}>Cargando comisiones…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ textAlign: 'left', padding: 12 }}>{data ? `Comisiones de ${monthLabel(data.period)}` : 'Comisiones'}</caption>
            <thead><tr>{['Comercio', 'Pedidos entregados', 'Ventas', 'Comisión', 'Estado', 'Acción'].map(label => <th key={label} scope="col" style={cellStyle}>{label}</th>)}</tr></thead>
            <tbody>
              {(data?.items ?? []).map(item => {
                const action = nextAction(item);
                const rowBusy = busy === item.restaurantId;
                return <tr key={item.restaurantId} style={{ borderTop: '1px solid var(--bd-1)', verticalAlign: 'top' }}>
                  <td style={cellStyle}>{item.restaurantName ?? item.restaurantId}</td>
                  <td style={cellStyle}>{item.ordersCount}{item.cancelledCount > 0 && <span style={{ color: 'var(--tx-mut)' }}> · {item.cancelledCount} cancelado(s)</span>}</td>
                  <td style={cellStyle}>{formatCents(item.salesCents)}</td>
                  <td style={{ ...cellStyle, fontWeight: 700 }}>{formatCents(item.commissionCents)}</td>
                  <td style={cellStyle}>
                    {statusLabel(item.status)}
                    {item.status === 'PAID' && item.paymentReference && <div style={{ fontSize: 12, color: 'var(--tx-mut)' }}>Ref. {item.paymentReference}</div>}
                    {(item.status === 'OPEN' || item.status === 'TO_ISSUE') && item.pendingCount > 0 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, fontWeight: 600 }}>
                      <AlertCircle size={14} aria-hidden="true" />{item.pendingCount} pedido(s) sin entregar ni cancelar
                    </div>}
                    {item.excludedCount > 0 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12, fontWeight: 600 }}>
                      <AlertCircle size={14} aria-hidden="true" />{item.excludedCount} pedido(s) sin comisión registrada
                    </div>}
                  </td>
                  <td style={cellStyle}>
                    {action === 'ISSUE' && <button type="button" style={controlStyle} disabled={rowBusy}
                      onClick={() => void run(item, () => issueStatement(api, item.restaurantId, item.period),
                        `Estado de cuenta de ${item.restaurantName ?? 'el comercio'} emitido.`)}>{rowBusy ? 'Emitiendo…' : 'Emitir'}</button>}
                    {action === 'PAY' && paying !== item.restaurantId && <button type="button" style={controlStyle} disabled={rowBusy}
                      onClick={() => { setPaying(item.restaurantId); setReference(''); setNote(''); }}>Marcar pagado</button>}
                    {action === 'PAY' && paying === item.restaurantId && <form style={{ display: 'grid', gap: 8, minWidth: 220 }}
                      onSubmit={event => { event.preventDefault(); if (!paymentProblem) void run(item,
                        () => payStatement(api, item.restaurantId, item.period, reference, note), 'Pago registrado.'); }}>
                      <label style={{ fontSize: 12 }}>Referencia del pago
                        <input value={reference} onChange={event => setReference(event.target.value)} maxLength={200} required
                          placeholder="SPEI, folio o recibo" style={{ ...controlStyle, width: '100%' }} />
                      </label>
                      <label style={{ fontSize: 12 }}>Nota (opcional)
                        <input value={note} onChange={event => setNote(event.target.value)} maxLength={500} style={{ ...controlStyle, width: '100%' }} />
                      </label>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={controlStyle} disabled={rowBusy || Boolean(paymentProblem)}>{rowBusy ? 'Guardando…' : 'Guardar pago'}</button>
                        <button type="button" style={controlStyle} disabled={rowBusy} onClick={() => setPaying(null)}>Cancelar</button>
                      </div>
                    </form>}
                    {!action && <span style={{ color: 'var(--tx-mut)' }}>—</span>}
                  </td>
                </tr>;
              })}
              {data && data.items.length === 0 && <tr><td colSpan={6} style={{ ...cellStyle, padding: 24 }}>Ningún comercio tiene pedidos en efectivo del Mercadito en {monthLabel(data.period)}.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
