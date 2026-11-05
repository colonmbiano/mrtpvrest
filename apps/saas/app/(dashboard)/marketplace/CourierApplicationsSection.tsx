'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Solicitudes de repartidor (identidad global del marketplace). La persona se
// registra como COURIER desde la app de repartidores; aquí la plataforma aprueba
// o rechaza la solicitud de rol. OJO: aprobar autoriza el rol de la cuenta —la
// activación para despacho (MarketplaceNetworkCourier VERIFIED) es un paso aparte
// (ops/couriers/:id/approve). Ver docs/plan-repartidor-independiente.md.
type ApplicationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
type Decision = 'APPROVED' | 'REJECTED';

interface CourierApplication {
  id: string;
  role: 'MERCHANT' | 'COURIER';
  status: ApplicationStatus;
  vehicle: string | null;
  network: string | null;
  createdAt: string;
  account: { fullName: string; email: string; city: string; phone: string; emailVerifiedAt: string | null };
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  PENDING_REVIEW: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', SUSPENDED: 'Suspendido',
};

const VEHICLE_LABEL: Record<string, string> = {
  MOTO: '🏍️ Moto', BICI: '🚲 Bici', AUTO: '🚗 Auto', PIE: '🚶 A pie', CAMIONETA: '🚐 Camioneta',
};

const NETWORK_LABEL: Record<string, string> = {
  SHARED: 'Red compartida', OWN: 'Solo propios',
};

// Solo PENDING_REVIEW tiene acciones; el resto es informativo.
const ACTIONS: Record<ApplicationStatus, { decision: Decision; label: string }[]> = {
  PENDING_REVIEW: [{ decision: 'APPROVED', label: 'Aprobar' }, { decision: 'REJECTED', label: 'Rechazar' }],
  APPROVED: [], REJECTED: [], SUSPENDED: [],
};

const controlStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'var(--surf-1)', color: 'var(--tx)' };
const cellStyle = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13 };

function loadError(error: unknown): string {
  const response = (error as { response?: { status?: number; data?: { error?: string } } })?.response;
  // 404: la identidad del marketplace no está montada en este entorno (feature flag apagado).
  if (response?.status === 404) return 'La identidad del marketplace no está habilitada en este entorno.';
  return response?.data?.error || 'No se pudieron cargar las solicitudes de repartidor.';
}

export function CourierApplicationsSection() {
  const [status, setStatus] = useState<ApplicationStatus>('PENDING_REVIEW');
  const [items, setItems] = useState<CourierApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/api/marketplace/identity/admin/applications', { params: { status } })
      .then(({ data }) => {
        // El backend devuelve MERCHANT y COURIER juntos; esta sección solo muestra repartidores.
        const rows: CourierApplication[] = Array.isArray(data?.applications) ? data.applications : [];
        if (!cancelled) setItems(rows.filter(row => row.role === 'COURIER'));
      })
      .catch(err => { if (!cancelled) { setItems([]); setError(loadError(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, refresh]);

  async function review(item: CourierApplication, decision: Decision) {
    if (busy) return;
    if (decision === 'REJECTED' && !window.confirm(`¿Rechazar la solicitud de ${item.account.fullName}?`)) return;
    setBusy(item.id); setError('');
    try {
      await api.post(`/api/marketplace/identity/admin/applications/${encodeURIComponent(item.id)}/decision`, { decision });
      setRefresh(value => value + 1);
    } catch (err) {
      setError(loadError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="courier-applications-title" style={{ marginBottom: 32 }}>
      <h2 id="courier-applications-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Repartidores de la red</h2>
      <p style={{ fontSize: 13, color: 'var(--tx-mut)' }}>
        Solicitudes de repartidor independiente creadas desde la app. Aprobar autoriza el rol;
        la activación para despacho (verificación) es un paso posterior.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label htmlFor="courier-applications-filter">Estado</label>
        <select id="courier-applications-filter" value={status} style={controlStyle}
          onChange={event => setStatus(event.target.value as ApplicationStatus)}>
          <option value="PENDING_REVIEW">Pendientes</option>
          <option value="APPROVED">Aprobados</option>
          <option value="REJECTED">Rechazados</option>
          <option value="SUSPENDED">Suspendidos</option>
        </select>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} style={controlStyle}>Actualizar</button>
      </div>
      {error && <div role="alert" style={{ padding: 16, marginBottom: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}
      <div style={{ background: 'var(--surf-1)', border: '1px solid var(--bd-1)', borderRadius: 12, overflowX: 'auto' }} aria-busy={loading}>
        {loading ? <p role="status" style={{ padding: 24 }}>Cargando solicitudes…</p> : items.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--tx-mut)' }}>No hay solicitudes de repartidor en este estado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                {['Repartidor', 'Contacto', 'Vehículo', 'Red', 'Estado', 'Solicitado', 'Acciones'].map(h => <th key={h} scope="col" style={cellStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                  <td style={cellStyle}>
                    <strong>{item.account.fullName}</strong>
                    <div style={{ fontSize: 12, color: 'var(--tx-mut)' }}>{item.account.email}</div>
                    {!item.account.emailVerifiedAt && <div style={{ fontSize: 12, color: '#f59e0b' }}>Correo sin verificar</div>}
                  </td>
                  <td style={cellStyle}>
                    {item.account.phone}
                    <div style={{ fontSize: 12, color: 'var(--tx-mut)' }}>{item.account.city}</div>
                  </td>
                  <td style={cellStyle}>{item.vehicle ? (VEHICLE_LABEL[item.vehicle] ?? item.vehicle) : '—'}</td>
                  <td style={cellStyle}>{item.network ? (NETWORK_LABEL[item.network] ?? item.network) : '—'}</td>
                  <td style={cellStyle}>{STATUS_LABEL[item.status]}</td>
                  <td style={cellStyle}>{new Date(item.createdAt).toLocaleDateString('es-MX')}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ACTIONS[item.status].length === 0 ? <span style={{ fontSize: 12, color: 'var(--tx-mut)' }}>—</span> : ACTIONS[item.status].map(action => (
                        <button key={action.decision} type="button" style={controlStyle}
                          disabled={busy !== null || (action.decision === 'APPROVED' && !item.account.emailVerifiedAt)}
                          title={action.decision === 'APPROVED' && !item.account.emailVerifiedAt
                            ? 'El repartidor debe verificar su correo antes de aprobar' : undefined}
                          onClick={() => { void review(item, action.decision); }}>
                          {busy === item.id ? '…' : action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
