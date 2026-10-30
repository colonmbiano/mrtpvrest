'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

// Solicitudes de comercios para el directorio del marketplace. El negocio las
// crea desde su panel (Módulos → Marketplace); aquí la plataforma decide.
type MembershipStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
type Decision = 'APPROVE' | 'REJECT' | 'SUSPEND' | 'REINSTATE';

interface Application {
  restaurantId: string;
  status: MembershipStatus;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  moduleEnabled: boolean;
  restaurant: { name: string | null; slug: string | null; isActive: boolean; tenantName: string | null; isDemo: boolean };
}

const STATUS_LABEL: Record<MembershipStatus, string> = {
  PENDING: 'Pendiente', APPROVED: 'Aprobado', REJECTED: 'Rechazado', SUSPENDED: 'Suspendido',
};
// Mismas transiciones que el backend (lib/marketplace-merchant-membership.js).
const ACTIONS: Record<MembershipStatus, { decision: Decision; label: string }[]> = {
  PENDING: [{ decision: 'APPROVE', label: 'Aprobar' }, { decision: 'REJECT', label: 'Rechazar' }],
  APPROVED: [{ decision: 'SUSPEND', label: 'Suspender' }],
  SUSPENDED: [{ decision: 'REINSTATE', label: 'Reactivar' }],
  REJECTED: [],
};

const controlStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'var(--surf-1)', color: 'var(--tx)' };
const cellStyle = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13 };

function loadError(error: unknown): string {
  const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
  return data?.error || 'No se pudieron cargar las solicitudes del directorio.';
}

export function MerchantApplicationsSection() {
  const [status, setStatus] = useState<MembershipStatus | ''>('PENDING');
  const [items, setItems] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    api.get('/api/saas/marketplace/memberships', { params: status ? { status } : {} })
      .then(({ data }) => { if (!cancelled) setItems(Array.isArray(data) ? data : []); })
      .catch(err => { if (!cancelled) { setItems([]); setError(loadError(err)); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, refresh]);

  async function review(item: Application, decision: Decision) {
    if (busy) return;
    const note = decision === 'APPROVE' ? '' : window.prompt('Nota para el negocio (opcional):') ?? null;
    if (note === null) return; // Canceló el diálogo.
    setBusy(item.restaurantId); setError('');
    try {
      await api.post(`/api/saas/marketplace/memberships/${encodeURIComponent(item.restaurantId)}/review`,
        { decision, ...(note.trim() ? { note: note.trim() } : {}) });
      setRefresh(value => value + 1);
    } catch (err) {
      setError(loadError(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="merchant-applications-title" style={{ marginBottom: 32 }}>
      <h2 id="merchant-applications-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Comercios del directorio</h2>
      <p style={{ fontSize: 13, color: 'var(--tx-mut)' }}>
        Negocios con el módulo Marketplace que pidieron aparecer. Solo los aprobados se publican en el directorio.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label htmlFor="merchant-applications-filter">Estado</label>
        <select id="merchant-applications-filter" value={status} style={controlStyle}
          onChange={event => setStatus(event.target.value as MembershipStatus | '')}>
          <option value="PENDING">Pendientes</option>
          <option value="APPROVED">Aprobados</option>
          <option value="SUSPENDED">Suspendidos</option>
          <option value="REJECTED">Rechazados</option>
          <option value="">Todos</option>
        </select>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading} style={controlStyle}>Actualizar</button>
      </div>
      {error && <div role="alert" style={{ padding: 16, marginBottom: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>{error}</div>}
      <div style={{ background: 'var(--surf-1)', border: '1px solid var(--bd-1)', borderRadius: 12, overflowX: 'auto' }} aria-busy={loading}>
        {loading ? <p role="status" style={{ padding: 24 }}>Cargando solicitudes…</p> : items.length === 0 ? (
          <p style={{ padding: 24, color: 'var(--tx-mut)' }}>No hay solicitudes en este estado.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--bd-1)' }}>
                {['Comercio', 'Negocio', 'Estado', 'Solicitado', 'Módulo', 'Acciones'].map(h => <th key={h} scope="col" style={cellStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.restaurantId} style={{ borderBottom: '1px solid var(--bd-1)' }}>
                  <td style={cellStyle}>
                    <strong>{item.restaurant.name || item.restaurantId}</strong>
                    {item.restaurant.slug && <div style={{ fontSize: 12, color: 'var(--tx-mut)' }}>/{item.restaurant.slug}</div>}
                  </td>
                  <td style={cellStyle}>{item.restaurant.tenantName || '—'}{item.restaurant.isDemo ? ' (demo)' : ''}</td>
                  <td style={cellStyle}>
                    {STATUS_LABEL[item.status]}
                    {item.reviewNote && <div style={{ fontSize: 12, color: 'var(--tx-mut)' }}>{item.reviewNote}</div>}
                  </td>
                  <td style={cellStyle}>{new Date(item.requestedAt).toLocaleDateString('es-MX')}</td>
                  <td style={cellStyle}>{item.moduleEnabled ? 'Activo' : 'Inactivo'}</td>
                  <td style={cellStyle}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {ACTIONS[item.status].map(action => (
                        <button key={action.decision} type="button" style={controlStyle}
                          disabled={busy !== null || (action.decision !== 'REJECT' && action.decision !== 'SUSPEND' && !item.moduleEnabled)}
                          title={!item.moduleEnabled && (action.decision === 'APPROVE' || action.decision === 'REINSTATE')
                            ? 'El negocio debe tener el módulo Marketplace activo' : undefined}
                          onClick={() => { void review(item, action.decision); }}>
                          {busy === item.restaurantId ? '…' : action.label}
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
