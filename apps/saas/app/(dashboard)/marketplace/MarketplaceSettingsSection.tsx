'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import api from '@/lib/api';

type Settings = { commissionBps: number; maxDeliveryKm: number; ordersEnabled: boolean; deliveryEnabled: boolean };
type Audit = { id: string; createdAt: string; metadata: { version: number; actorId: string; before: Settings; after: Settings } };
type State = { version: number; settings: Settings; integrations: {
  email: boolean; captcha: boolean; push: boolean; buyerSigning: boolean; accountsActive: boolean; pin: boolean;
}; history: Audit[] };
const endpoint = '/api/saas/marketplace/settings';
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'var(--bg)', color: 'var(--tx)' };
function errorMessage(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.error === 'string'
    ? error.response.data.error : 'No se pudo conectar. Intenta de nuevo.';
}
const changes = (row: Audit) => {
  const { before, after } = row.metadata;
  return [before.commissionBps !== after.commissionBps && `Comisión: ${after.commissionBps / 100}%`,
    before.maxDeliveryKm !== after.maxDeliveryKm && `Radio: ${after.maxDeliveryKm} km`,
    before.ordersEnabled !== after.ordersEnabled && `Pedidos: ${after.ordersEnabled ? 'activos' : 'pausados'}`,
    before.deliveryEnabled !== after.deliveryEnabled && `Domicilio: ${after.deliveryEnabled ? 'activo' : 'pausado'}`,
  ].filter(Boolean).join(' · ') || 'Configuración guardada';
};

export function MarketplaceSettingsSection() {
  const [data, setData] = useState<State | null>(null);
  const [commission, setCommission] = useState('');
  const [radius, setRadius] = useState('');
  const [orders, setOrders] = useState(false);
  const [delivery, setDelivery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function populate(next: State) {
    setData(next); setCommission(String(next.settings.commissionBps / 100));
    setRadius(String(next.settings.maxDeliveryKm)); setOrders(next.settings.ordersEnabled); setDelivery(next.settings.deliveryEnabled);
  }
  useEffect(() => {
    let active = true;
    api.get<State>(endpoint).then(response => { if (active) populate(response.data); })
      .catch((failure: unknown) => { if (active) setError(errorMessage(failure)); });
    return () => { active = false; };
  }, []);
  const draft: Settings = { commissionBps: Math.round(Number(commission) * 100), maxDeliveryKm: Number(radius), ordersEnabled: orders, deliveryEnabled: delivery };
  const dirty = !!data && Object.keys(draft).some(key => draft[key as keyof Settings] !== data.settings[key as keyof Settings]);
  async function reload() {
    setBusy(true); setError(''); setNotice('');
    try { populate((await api.get<State>(endpoint)).data); }
    catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !dirty || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      populate((await api.patch<State>(endpoint, { version: data.version, settings: draft })).data);
      setNotice('Cambios guardados. Se aplican a las nuevas solicitudes.');
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setBusy(false); }
  }
  return <section aria-labelledby="marketplace-settings-title" style={{ marginBottom: 32, padding: 24, border: '1px solid var(--bd-1)', borderRadius: 12, background: 'var(--surf-1)' }}>
    <h2 id="marketplace-settings-title" style={{ margin: '0 0 8px', fontSize: 22 }}>Administrar Mercadito Colorines</h2>
    <p style={{ color: 'var(--tx-mut)', margin: '0 0 24px' }}>Controla la operación y las condiciones de los pedidos nuevos.</p>
    {error && <p role="alert" style={{ color: '#ef4444' }}>{error}</p>}
    {notice && <p role="status" style={{ color: '#10b981' }}>{notice}</p>}
    {!data ? <div><p>{error ? 'Configuración no disponible.' : 'Cargando configuración…'}</p>
      {error && <button type="button" disabled={busy} onClick={reload}>Volver a cargar</button>}</div> : <>
      <form onSubmit={save}>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Condiciones y disponibilidad del marketplace</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
            <label>Comisión de la plataforma (%)
              <input aria-describedby="commission-help" type="number" min="0" max="100" step="0.01" required value={commission} onChange={event => setCommission(event.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
              <span id="commission-help" style={{ display: 'block', fontSize: 13, color: 'var(--tx-mut)', marginTop: 8 }}>Se aplica a las cotizaciones nuevas. Las ya emitidas conservan su comisión.</span>
            </label>
            <label>Radio máximo de entrega (km)
              <input aria-describedby="radius-help" type="number" min="0.1" max="5" step="0.1" required value={radius} onChange={event => setRadius(event.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
              <span id="radius-help" style={{ display: 'block', fontSize: 13, color: 'var(--tx-mut)', marginTop: 8 }}>Desde cada sucursal, hasta 5 km. Se respetan los límites menores del negocio.</span>
            </label>
          </div>
          <div style={{ display: 'grid', gap: 16, margin: '24px 0' }}>
            <label style={{ display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={orders} onChange={event => setOrders(event.target.checked)} /> Aceptar pedidos nuevos</label>
            <label style={{ display: 'flex', gap: 12, alignItems: 'center' }}><input type="checkbox" checked={delivery} onChange={event => setDelivery(event.target.checked)} /> Ofrecer entrega a domicilio</label>
          </div>
          <p style={{ color: 'var(--tx-mut)', fontSize: 13 }}>Pausar pedidos mantiene el seguimiento de los existentes. Al pausar domicilio, los nuevos pedidos pueden recogerse en el negocio.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <button type="submit" disabled={!dirty || busy} style={{ padding: '12px 20px', borderRadius: 8, border: 0, background: 'var(--tx)', color: 'var(--bg)', opacity: !dirty || busy ? 0.5 : 1 }}>{busy ? 'Guardando…' : 'Guardar cambios'}</button>
            <button type="button" disabled={busy} onClick={reload} style={{ padding: '12px 20px', borderRadius: 8, border: '1px solid var(--bd-1)', background: 'transparent', color: 'var(--tx)' }}>Actualizar valores</button>
          </div>
        </fieldset>
      </form>
      <h3 style={{ marginTop: 32 }}>Estado de las integraciones</h3>
      <p style={{ color: 'var(--tx-mut)', fontSize: 13 }}>La presencia de las claves no confirma la autorización del dominio. Las credenciales privadas se gestionan en la configuración segura del servicio.</p>
      <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 16 }}>
        {[
          ['Correos', data.integrations.email], ['Protección del registro', data.integrations.captcha],
          ['Notificaciones', data.integrations.push], ['Seguridad de pedidos', data.integrations.pin],
          ['Cuentas de compradores', data.integrations.accountsActive],
        ].map(([label, configured]) => <div key={String(label)} style={{ padding: 12, border: '1px solid var(--bd-1)', borderRadius: 8 }}><dt>{label}</dt><dd style={{ margin: '8px 0 0', color: configured ? '#10b981' : 'var(--tx-mut)' }}>{configured ? 'Configurado' : 'Pendiente'}</dd></div>)}
      </dl>
      <h3 style={{ marginTop: 28 }}>Últimos cambios</h3>
      {!data.history.length ? <p style={{ color: 'var(--tx-mut)' }}>Todavía no hay cambios guardados desde este panel.</p> : <ul style={{ paddingLeft: 20 }}>
        {data.history.map(row => <li key={row.id} style={{ marginBottom: 12 }}><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('es-MX')}</time> — {changes(row)} <small style={{ color: 'var(--tx-mut)' }}>(versión {row.metadata.version})</small></li>)}
      </ul>}
    </>}
  </section>;
}
