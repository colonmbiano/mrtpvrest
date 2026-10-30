'use client';
import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { AlertCircle } from 'lucide-react';
import { DispatchAuditSection } from './DispatchAuditSection';
import { MerchantApplicationsSection } from './MerchantApplicationsSection';
import { loadMarketplaceOverview, type MarketplaceOverview } from '@/lib/marketplaceOverview';

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  RESTAURANT: '🍽️ Restaurante',
  GROCERY: '🥑 Abarrotes',
  RETAIL: '🛍️ Tienda',
  HARDWARE: '🔨 Ferretería',
  AUTOPARTS: '🚗 Refaccionaria',
};

const EVENT_LABELS: Record<string, string> = {
  ORDER_CAPTURED: 'Pago recibido', ORDER_SETTLED: 'Pedido liquidado', ORDER_REFUNDED: 'Reembolso',
  PAYOUT_DISBURSED: 'Retiro pagado', MANUAL_ADJUSTMENT: 'Ajuste manual',
};

export default function MarketplacePage() {
  const [overview, setOverview] = useState<MarketplaceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      try {
        const result = await loadMarketplaceOverview(api);
        if (active) setOverview(result);
      } catch (err: any) {
        if (active) { setError(err?.response?.data?.error || err?.message || 'Error al cargar datos'); setOverview(null); }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadData();
    return () => { active = false; };
  }, []);

  const stores = overview?.merchants ?? [];
  const transactions = overview?.recentTransactions ?? [];
  const formatCurrency = (amount: number | undefined) => amount === undefined ? '—' : `$${amount.toFixed(2)}`;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-MX');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--tx)', fontFamily: 'system-ui, sans-serif', padding: '32px 24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 8px 0' }}>Marketplace Global</h1>
          <p style={{ fontSize: '14px', color: 'var(--tx-mut)', margin: 0 }}>Métricas y auditoría de comisiones, ledger y comercios</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            borderRadius: '8px',
            padding: '16px',
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-start',
            marginBottom: '24px',
            color: '#ef4444',
          }}>
            <AlertCircle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
            <span style={{ fontSize: '14px' }}>{error}</span>
          </div>
        )}

        {/* Métricas */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
          {[
            { label: 'GMV pagado', value: formatCurrency(overview?.gmvTotal), icon: '💰' },
            { label: 'Comisiones contabilizadas', value: formatCurrency(overview?.platformFees), icon: '📊' },
            { label: 'Total Órdenes', value: overview?.totalOrders.toString() ?? '—', icon: '📦' },
            { label: 'Comercios Activos', value: overview?.activeMerchants.toString() ?? '—', icon: '🏪' },
          ].map((m, i) => (
            <div key={i} style={{
              background: 'var(--surf-1)',
              border: '1px solid var(--bd-1)',
              borderRadius: '12px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div>
                  <p style={{ fontSize: '12px', color: 'var(--tx-mut)', margin: '0 0 8px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{m.label}</p>
                  <p style={{ fontSize: '28px', fontWeight: '700', margin: 0 }}>{m.value}</p>
                </div>
                <span style={{ fontSize: '32px' }}>{m.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <MerchantApplicationsSection />

        <DispatchAuditSection />

        {/* Ledger Balance */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 16px 0' }}>Balance del Ledger</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Fondos en Pasarela (ESCROW)', value: formatCurrency(overview?.balances.GATEWAY_ESCROW), color: '#3b82f6' },
              { label: 'Por Pagar a Comercios', value: formatCurrency(overview?.balances.MERCHANT_PAYABLE), color: '#10b981' },
              { label: 'Por Pagar a Repartidores', value: formatCurrency(overview?.balances.COURIER_PAYABLE), color: '#f59e0b' },
            ].map((l, i) => (
              <div key={i} style={{
                background: 'var(--surf-1)',
                border: `1px solid ${l.color}40`,
                borderRadius: '12px',
                padding: '20px',
              }}>
                <p style={{ fontSize: '12px', color: 'var(--tx-mut)', margin: '0 0 8px 0', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{l.label}</p>
                <p style={{ fontSize: '24px', fontWeight: '700', margin: 0, color: l.color }}>{l.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Comercios */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 16px 0' }}>Comercios del Marketplace</h2>
          <div style={{
            background: 'var(--surf-1)',
            border: '1px solid var(--bd-1)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>Cargando...</div>
            ) : stores.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>{error ? 'Auditoría no disponible' : 'No hay comercios'}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                      {['Nombre', 'Giro', 'Estado', 'Órdenes', 'GMV'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--tx-mut)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s, i) => (
                      <tr key={s.id} style={{ borderBottom: i < stores.length - 1 ? '1px solid var(--bd-1)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{s.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{BUSINESS_TYPE_LABELS[s.businessType] ?? s.businessType}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                          {s.isActive ? 'Activo' : 'Inactivo'}
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{s.orderCount}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{formatCurrency(s.gmv)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Movimientos reales publicados por la auditoría contable */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 16px 0' }}>Movimientos contables recientes</h2>
          <div style={{
            background: 'var(--surf-1)',
            border: '1px solid var(--bd-1)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>Cargando...</div>
            ) : transactions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>{error ? 'Auditoría no disponible' : 'No hay movimientos contables'}</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                      {['Orden', 'Tienda', 'Importe', 'Movimiento', 'Fecha'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--tx-mut)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((o, i) => (
                      <tr key={o.id} style={{ borderBottom: i < transactions.length - 1 ? '1px solid var(--bd-1)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{o.orderId}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{stores.find(s => s.id === o.restaurantId)?.name ?? o.restaurantId}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{formatCurrency(o.amount)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: 'rgba(107, 114, 128, 0.1)',
                            color: 'var(--tx-mut)',
                          }}>
                            {EVENT_LABELS[o.eventType] ?? o.eventType}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--tx-mut)' }}>{formatDate(o.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
