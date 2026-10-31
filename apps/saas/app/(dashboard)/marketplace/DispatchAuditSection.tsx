'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { classifyDispatchTask, countDispatchTasks, DISPATCH_STATUSES, dispatchLoadError, filterDispatchTasks,
  loadDispatchPage, mergeDispatchTasks, type DispatchAuditTask, type DispatchFilter } from '@/lib/marketplaceDispatchAudit';

const controlStyle = { padding: '8px 12px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'var(--surf-1)', color: 'var(--tx)' };
const cellStyle = { padding: '12px 16px', textAlign: 'left' as const, fontSize: 13 };

export function DispatchAuditSection() {
  const [filter, setFilter] = useState<DispatchFilter>('ACTIVE');
  const [tasks, setTasks] = useState<DispatchAuditTask[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const generation = useRef(0);
  const pagingRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    generation.current++;
    pagingRequest.current?.abort(); pagingRequest.current = null;
    setTasks([]); setNextCursor(null); setLoading(true); setLoadingMore(false); setError('');
    void loadDispatchPage(api, { filter, signal: controller.signal }).then(page => {
      if (!controller.signal.aborted) { setTasks(page.items); setNextCursor(page.nextCursor); }
    }).catch(error => {
      if (!controller.signal.aborted) setError(dispatchLoadError(error));
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); pagingRequest.current?.abort(); };
  }, [filter, refresh]);

  async function loadMore() {
    if (!nextCursor || loading || loadingMore || pagingRequest.current) return;
    const controller = new AbortController(); const ticket = generation.current;
    pagingRequest.current = controller; setLoadingMore(true); setError('');
    try {
      const page = await loadDispatchPage(api, { filter, cursor: nextCursor, signal: controller.signal });
      if (!controller.signal.aborted && ticket === generation.current) {
        setTasks(previous => mergeDispatchTasks(previous, page.items)); setNextCursor(page.nextCursor);
      }
    } catch (error) {
      if (!controller.signal.aborted && ticket === generation.current) setError(dispatchLoadError(error));
    } finally {
      if (pagingRequest.current === controller) pagingRequest.current = null;
      if (!controller.signal.aborted && ticket === generation.current) setLoadingMore(false);
    }
  }

  const visibleTasks = filterDispatchTasks(tasks, filter);
  const counts = countDispatchTasks(visibleTasks);
  return (
    <section aria-labelledby="dispatch-audit-title" style={{ marginBottom: 32 }}>
      <h2 id="dispatch-audit-title" style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Auditoría de operaciones de despacho</h2>
      <p style={{ fontSize: 13, color: 'var(--tx-mut)' }}>Supervisión global de tareas propias y de la red compartida.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <label htmlFor="dispatch-audit-filter">Estado</label>
        <select id="dispatch-audit-filter" value={filter} onChange={event => setFilter(event.target.value as DispatchFilter)} style={controlStyle}>
          <option value="ACTIVE">Tareas activas</option><option value="ALL">Todos los estados</option>
          {DISPATCH_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
        </select>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading || loadingMore} style={controlStyle}>Actualizar</button>
      </div>
      <dl style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 8 }}>
        {[
          ['Visibles', counts.total], ['Activas', counts.active], ['Con alerta', counts.attention],
          ['OWN · Propias', counts.own], ['SHARED · Red', counts.shared], ['Sin modo asignado', counts.unassigned],
        ].map(([label, count]) => <div key={label}><dt style={{ fontSize: 12, color: 'var(--tx-mut)' }}>{label}</dt><dd style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>{count}</dd></div>)}
      </dl>
      <p style={{ fontSize: 12, color: 'var(--tx-mut)' }}>Contadores de las tareas visibles entre {tasks.length} tareas cargadas.{nextCursor ? ' Hay más tareas por cargar.' : ''}</p>
      {error && <div role="alert" style={{ padding: 16, marginBottom: 12, background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
        <p>{error}</p><button type="button" style={controlStyle} disabled={loading || loadingMore} onClick={() => setRefresh(value => value + 1)}>Reintentar</button>
      </div>}
      <div style={{ background: 'var(--surf-1)', border: '1px solid var(--bd-1)', borderRadius: 12, overflowX: 'auto' }} aria-busy={loading || loadingMore}>
        {loading ? <p role="status" style={{ padding: 24 }}>Cargando tareas de despacho…</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <caption style={{ textAlign: 'left', padding: 12 }}>Tareas de despacho · {visibleTasks.length} visibles</caption>
            <thead><tr>{['Task ID', 'Modo de despacho', 'Estado de tarea', 'Intentos de asignación', 'Alerta'].map(label => <th key={label} scope="col" style={cellStyle}>{label}</th>)}</tr></thead>
            <tbody>{visibleTasks.map(task => {
              const { needsAttention } = classifyDispatchTask(task);
              return <tr key={task.taskId} style={{ borderTop: '1px solid var(--bd-1)', background: needsAttention ? 'rgba(245,158,11,0.12)' : undefined }}>
                <td style={cellStyle}>{task.taskId}</td>
                <td style={cellStyle}>{task.dispatchMode === 'OWN' ? 'OWN · Propios' : task.dispatchMode === 'SHARED' ? 'SHARED · Red compartida' : 'Sin asignar'}</td>
                <td style={cellStyle}>{task.taskStatus}</td><td style={cellStyle}>{task.attempts}</td>
                <td style={cellStyle}>{needsAttention ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 700 }}>
                  <AlertCircle size={16} aria-hidden="true" />{task.taskStatus === 'REASSIGNING' ? 'Reasignación en curso' : 'Dos o más intentos'}
                </span> : 'Sin alertas'}</td>
              </tr>;
            })}
            {visibleTasks.length === 0 && <tr><td colSpan={5} style={{ ...cellStyle, padding: 24 }}>{error ? 'No se pudieron mostrar tareas.' : 'No hay tareas de este estado entre las tareas cargadas.'}</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      {nextCursor && <button type="button" onClick={() => { void loadMore(); }} disabled={loading || loadingMore} style={{ ...controlStyle, marginTop: 12 }}>
        {loadingMore ? 'Cargando más…' : 'Cargar más tareas'}
      </button>}
    </section>
  );
}
