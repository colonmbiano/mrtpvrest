'use client';
import { useState, useEffect, useMemo } from 'react';
import api from '@/lib/api';
import { AlertCircle } from 'lucide-react';
import { DispatchAuditSection } from './DispatchAuditSection';

interface Store {
  id: string;
  name: string;
  businessType: 'RESTAURANT' | 'GROCERY' | 'RETAIL' | 'HARDWARE' | 'AUTOPARTS';
  collectorId?: string;
  orderCount: number;
  gmv: number;
  createdAt: string;
}

interface Order {
  id: string;
  orderNumber: string;
  storeId: string;
  storeName: string;
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: string;
  createdAt: string;
}

interface LedgerEntry {
  type: 'GATEWAY_ESCROW' | 'MERCHANT_PAYABLE' | 'COURIER_PAYABLE' | 'PLATFORM_FEES';
  amount: number;
}

const BUSINESS_TYPE_LABELS = {
  RESTAURANT: '🍽️ Restaurante',
  GROCERY: '🥑 Abarrotes',
  RETAIL: '🛍️ Tienda',
  HARDWARE: '🔨 Ferretería',
  AUTOPARTS: '🚗 Refaccionaria',
};

export default function MarketplacePage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      try {
        const [storesRes, ordersRes, ledgerRes] = await Promise.all([
          api.get('/api/admin/marketplace/stores'),
          api.get('/api/admin/marketplace/orders'),
          api.get('/api/admin/marketplace/ledger'),
        ]);

        setStores(storesRes.data || []);
        setOrders(ordersRes.data || []);
        setLedger(ledgerRes.data || []);
      } catch (err: any) {
        setError(err?.response?.data?.error || 'Error al cargar datos');
        setStores([]);
        setOrders([]);
        setLedger([]);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const metrics = useMemo(() => {
    const gmvTotal = orders.reduce((s, o) => s + o.total, 0);
    const platformFees = orders.reduce((s, o) => s + (o.total * 0.05), 0);
    const totalOrders = orders.length;
    const activeStores = stores.filter(s => s.orderCount > 0).length;

    const gatewayEscrow = ledger.filter(l => l.type === 'GATEWAY_ESCROW').reduce((s, l) => s + l.amount, 0);
    const merchantPayable = ledger.filter(l => l.type === 'MERCHANT_PAYABLE').reduce((s, l) => s + l.amount, 0);
    const courierPayable = ledger.filter(l => l.type === 'COURIER_PAYABLE').reduce((s, l) => s + l.amount, 0);

    return { gmvTotal, platformFees, totalOrders, activeStores, gatewayEscrow, merchantPayable, courierPayable };
  }, [orders, ledger]);

  const recentOrders = useMemo(() => orders.slice(-10).reverse(), [orders]);

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`;
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
            { label: 'GMV Total', value: formatCurrency(metrics.gmvTotal), icon: '💰' },
            { label: 'Comisiones (5%)', value: formatCurrency(metrics.platformFees), icon: '📊' },
            { label: 'Total Órdenes', value: metrics.totalOrders.toString(), icon: '📦' },
            { label: 'Comercios Activos', value: metrics.activeStores.toString(), icon: '🏪' },
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

        <DispatchAuditSection />

        {/* Ledger Balance */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 16px 0' }}>Balance del Ledger</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
            {[
              { label: 'Fondos en Pasarela (ESCROW)', value: formatCurrency(metrics.gatewayEscrow), color: '#3b82f6' },
              { label: 'Por Pagar a Comercios', value: formatCurrency(metrics.merchantPayable), color: '#10b981' },
              { label: 'Por Pagar a Repartidores', value: formatCurrency(metrics.courierPayable), color: '#f59e0b' },
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
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>No hay comercios</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                      {['Nombre', 'Giro', 'Mercado Pago', 'Órdenes', 'GMV'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--tx-mut)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stores.map((s, i) => (
                      <tr key={i} style={{ borderBottom: i < stores.length - 1 ? '1px solid var(--bd-1)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{s.name}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{BUSINESS_TYPE_LABELS[s.businessType]}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                          {s.collectorId ? '✓ Activo' : '—'}
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

        {/* Órdenes Recientes */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', margin: '0 0 16px 0' }}>Órdenes Recientes</h2>
          <div style={{
            background: 'var(--surf-1)',
            border: '1px solid var(--bd-1)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {loading ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>Cargando...</div>
            ) : recentOrders.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-mut)' }}>No hay órdenes</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                      {['Orden', 'Tienda', 'Subtotal', 'Envío', 'Total', 'Estado', 'Fecha'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: 'var(--tx-mut)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((o, i) => (
                      <tr key={i} style={{ borderBottom: i < recentOrders.length - 1 ? '1px solid var(--bd-1)' : 'none' }}>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{o.orderNumber}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{o.storeName}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{formatCurrency(o.subtotal)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>{formatCurrency(o.deliveryFee)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '500' }}>{formatCurrency(o.total)}</td>
                        <td style={{ padding: '12px 16px', fontSize: '14px' }}>
                          <span style={{
                            display: 'inline-block',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600',
                            background: o.status === 'DELIVERED' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(107, 114, 128, 0.1)',
                            color: o.status === 'DELIVERED' ? '#10b981' : '#6b7280',
                          }}>
                            {o.status}
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
