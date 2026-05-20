'use client';
// handoff/screens/DispatchScreen.tsx
// Vista del despachador/cajero — gestión de repartidores y asignación de pedidos
// Se monta dentro de la app delivery (acceso supervisor) o en el TPV

import React, { useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { C, S } from '@/lib/tokens';

// ── Types ──────────────────────────────────────────────────────
type DriverStatus = 'ON_ROUTE' | 'AVAILABLE' | 'PAUSED' | 'OFFLINE';

interface Driver {
  id: string;
  name: string;
  initials?: string;
  status: DriverStatus;
  color?: string;
  activeOrderCount?: number;
}

interface DispatchOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  driverId: string | null;
  driverName: string | null;
  status: 'PENDING_ASSIGN' | 'ON_THE_WAY' | 'READY' | 'DELIVERED';
  total: number;
  eta?: number;
}

// ── Constants ──────────────────────────────────────────────────
const DRIVER_STATUS_CONFIG: Record<DriverStatus, { label: string; color: string; bg: string }> = {
  ON_ROUTE:  { label: 'En Ruta',     color: C.amber, bg: C.amberSoft  },
  AVAILABLE: { label: 'Disponible',  color: C.green, bg: C.greenSoft  },
  PAUSED:    { label: 'En Pausa',    color: C.iris,  bg: C.irisSoft   },
  OFFLINE:   { label: 'Offline',     color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.06)' },
};

const ORDER_COLORS: Record<string, { color: string; bg: string }> = {
  ON_THE_WAY:     { color: C.amber, bg: C.amberSoft  },
  READY:          { color: C.iris,  bg: C.irisSoft   },
  PENDING_ASSIGN: { color: C.coral, bg: C.coralSoft  },
  DELIVERED:      { color: C.green, bg: C.greenSoft  },
};

// ── Sub-components ─────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={S.sectionLabel}>{children}</div>;
}

function StatusPill({ status, config }: { status: string; config: { label: string; color: string; bg: string } }) {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      padding: '3px 9px', borderRadius: 20, display: 'inline-flex', alignItems: 'center', gap: 4,
      background: config.bg, color: config.color, border: `1px solid ${config.color}30`,
    }}>
      <span style={{ width: 4, height: 4, borderRadius: '50%', background: config.color, flexShrink: 0 }} />
      {config.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────
interface DispatchScreenProps {
  onBack: () => void;
  locationId?: string;
}

export function DispatchScreen({ onBack, locationId }: DispatchScreenProps) {
  const [orders, setOrders]    = useState<DispatchOrder[]>([]);
  const [drivers, setDrivers]  = useState<Driver[]>([]);
  const [loading, setLoading]  = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'drivers'>('orders');
  const [assigning, setAssigning] = useState<string | null>(null); // order id

  // ── Fetch data ───────────────────────────────────────────────
  const fetchDispatchData = useCallback(async () => {
    try {
      const [ordersRes, driversRes] = await Promise.all([
        api.get('/api/delivery/dispatch/orders'),
        api.get('/api/delivery/dispatch/drivers'),
      ]);
      setOrders(ordersRes.data || []);
      setDrivers(driversRes.data || []);
    } catch {
      // Fallback a datos locales si hay error
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    fetchDispatchData();
    const interval = setInterval(fetchDispatchData, 15_000); // Refresh cada 15s
    return () => clearInterval(interval);
  }, [fetchDispatchData]);

  // ── Assign order to driver ───────────────────────────────────
  async function assignDriver(orderId: string, driver: Driver) {
    try {
      await api.put(`/api/delivery/dispatch/orders/${orderId}/assign`, { driverId: driver.id });
      setOrders(os => os.map(o =>
        o.id === orderId
          ? { ...o, driverId: driver.id, driverName: driver.name, status: 'READY' as const }
          : o
      ));
      setAssigning(null);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Error al asignar el pedido');
    }
  }

  // ── Derived state ────────────────────────────────────────────
  const pendingOrders  = orders.filter(o => o.status === 'PENDING_ASSIGN');
  const activeOrders   = orders.filter(o => o.status !== 'PENDING_ASSIGN' && o.status !== 'DELIVERED');
  const availDrivers   = drivers.filter(d => d.status === 'AVAILABLE');

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 11, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Cargando…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>

      {/* ── Header ── */}
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Despachador</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green, boxShadow: '0 0 6px rgba(136,214,108,0.8)', flexShrink: 0 }} />
            <span style={{ fontSize: 8, fontWeight: 700, color: C.green, letterSpacing: '0.12em', textTransform: 'uppercase' }}>En vivo</span>
          </div>
        </div>
        {pendingOrders.length > 0 && (
          <div style={{
            background: C.coralSoft, border: '1px solid rgba(255,92,51,0.35)',
            borderRadius: 20, padding: '4px 12px',
            fontSize: 9, fontWeight: 700, color: C.coral, letterSpacing: '0.1em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.coral, flexShrink: 0 }} />
            {pendingOrders.length} sin asignar
          </div>
        )}
        <button onClick={fetchDispatchData} style={{ ...S.iconBtn, flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
          </svg>
        </button>
      </div>

      {/* ── Stats ── */}
      <div style={{ display: 'flex', background: C.surf1, borderBottom: `1px solid ${C.border}` }}>
        {[
          { label: 'En ruta',     value: drivers.filter(d => d.status === 'ON_ROUTE').length,  color: C.amber },
          { label: 'Disponibles', value: availDrivers.length,                                   color: C.green },
          { label: 'Sin asignar', value: pendingOrders.length,                                  color: C.coral },
          { label: 'En camino',   value: activeOrders.filter(o => o.status === 'ON_THE_WAY').length, color: C.iris },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: '10px 4px', textAlign: 'center',
            borderRight: i < 3 ? `1px solid ${C.border}` : 'none',
          }}>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 7.5, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', background: C.surf1, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 60, zIndex: 9 }}>
        {[
          { id: 'orders',  label: `Pedidos (${orders.filter(o => o.status !== 'DELIVERED').length})` },
          { id: 'drivers', label: `Repartidores (${drivers.length})` },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} style={{
            flex: 1, height: 38, border: 'none', cursor: 'pointer', background: 'transparent',
            borderBottom: activeTab === tab.id ? `2px solid ${C.amber}` : '2px solid transparent',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: activeTab === tab.id ? C.amber : C.textMuted,
            fontFamily: C.fontBody, transition: 'all 0.15s',
          }}>{tab.label}</button>
        ))}
      </div>

      <div style={{ padding: '16px', paddingBottom: 40 }}>

        {/* ── ORDERS TAB ── */}
        {activeTab === 'orders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Sin asignar */}
            {pendingOrders.length > 0 && (
              <div>
                <SectionLabel>⚠ Sin asignar — requieren acción</SectionLabel>
                {pendingOrders.map(order => (
                  <div key={order.id} style={{
                    background: C.surf1, border: '1px solid rgba(255,92,51,0.3)',
                    borderRadius: 20, overflow: 'hidden', marginBottom: 10,
                  }}>
                    <div style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.coral }}>#{order.orderNumber}</div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 3 }}>{order.customerName}</div>
                          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>{order.deliveryAddress}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.text }}>${order.total.toFixed(2)}</div>
                          <div style={{ fontSize: 9, color: C.coral, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>Sin asignar</div>
                        </div>
                      </div>

                      {assigning === order.id ? (
                        <div>
                          <div style={{ ...S.sectionLabel, marginBottom: 8 }}>Selecciona repartidor:</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {availDrivers.map(d => (
                              <button key={d.id} onClick={() => assignDriver(order.id, d)} style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                                background: C.surf2, border: `1px solid ${(d.color || C.green)}40`,
                                color: C.text, textAlign: 'left', fontFamily: C.fontBody,
                              }}>
                                <div style={{
                                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                                  background: `${d.color || C.green}18`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  fontFamily: C.fontDisplay, fontSize: 11, fontWeight: 700,
                                  color: d.color || C.green,
                                }}>{d.initials || d.name[0]}</div>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{d.name}</div>
                                  <div style={{ fontSize: 9, color: C.green, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 2 }}>Disponible</div>
                                </div>
                                <svg viewBox="0 0 24 24" fill="none" stroke={C.green} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                                  <polyline points="9 18 15 12 9 6"/>
                                </svg>
                              </button>
                            ))}
                            {availDrivers.length === 0 && (
                              <div style={{ padding: '10px 12px', background: C.surf2, borderRadius: 12, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
                                No hay repartidores disponibles
                              </div>
                            )}
                            <button onClick={() => setAssigning(null)} style={{ ...S.btnSecondary, width: '100%', height: 38, borderRadius: 10 }}>Cancelar</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAssigning(order.id)} style={{
                          width: '100%', height: 44, borderRadius: 12, cursor: 'pointer',
                          background: C.coralSoft, border: '1px solid rgba(255,92,51,0.3)',
                          fontSize: 10, fontWeight: 700, color: C.coral,
                          letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: C.fontBody,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                        }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                            <circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/>
                            <path d="M15 6h-3L9.5 10.5 7 14"/><path d="M9.5 14H15.5"/><path d="M13 6h2.5l3 5.5"/>
                          </svg>
                          Asignar repartidor
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* En curso */}
            {activeOrders.length > 0 && (
              <div>
                <SectionLabel>En curso</SectionLabel>
                {activeOrders.map(order => {
                  const oc = (ORDER_COLORS[order.status] || ORDER_COLORS.READY)!;
                  const driver = drivers.find(d => d.id === order.driverId);
                  return (
                    <div key={order.id} style={{
                      background: C.surf1, border: `1px solid ${C.border}`,
                      borderRadius: 18, padding: '12px 14px', marginBottom: 8,
                      display: 'flex', gap: 12, alignItems: 'center',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: oc.bg, border: `1px solid ${oc.color}40`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: C.fontDisplay, fontSize: 12, fontWeight: 700, color: oc.color,
                      }}>#{order.orderNumber.slice(-2)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{order.customerName}</div>
                        <div style={{ fontSize: 10, color: C.textDim, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{order.deliveryAddress}</div>
                        {driver && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: driver.color || C.amber, flexShrink: 0 }} />
                            <span style={{ fontSize: 9, color: driver.color || C.amber, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{driver.name}</span>
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontFamily: C.fontDisplay, fontSize: 16, fontWeight: 700, color: C.text }}>${order.total.toFixed(2)}</div>
                        {order.eta && <div style={{ fontSize: 9, color: C.textMuted, marginTop: 3 }}>{order.eta} min</div>}
                        <StatusPill status={order.status} config={oc as any} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {orders.length === 0 && (
              <div style={{ padding: '44px 20px', textAlign: 'center', background: C.surf1, borderRadius: 24, border: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sin pedidos de delivery activos</div>
              </div>
            )}
          </div>
        )}

        {/* ── DRIVERS TAB ── */}
        {activeTab === 'drivers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {drivers.map(driver => {
              const st = DRIVER_STATUS_CONFIG[driver.status] || DRIVER_STATUS_CONFIG.OFFLINE;
              const driverOrders = orders.filter(o => o.driverId === driver.id && o.status !== 'DELIVERED');
              return (
                <div key={driver.id} style={{ background: C.surf1, border: `1px solid ${C.border}`, borderRadius: 20, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: driverOrders.length > 0 ? 12 : 0 }}>
                    <div style={{
                      width: 46, height: 46, borderRadius: 14, flexShrink: 0,
                      background: `${driver.color || C.amber}18`, border: `1px solid ${driver.color || C.amber}35`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: C.fontDisplay, fontSize: 14, fontWeight: 700, color: driver.color || C.amber,
                    }}>{driver.initials || driver.name.split(' ').map(w => w[0]).join('')}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{driver.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                        <div style={{ width: 5, height: 5, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 9, color: st.color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>{st.label}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontFamily: C.fontDisplay, fontSize: 18, fontWeight: 700, color: driverOrders.length > 0 ? C.amber : C.textMuted }}>
                        {driverOrders.length}
                      </div>
                      <div style={{ fontSize: 8, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>pedidos</div>
                    </div>
                  </div>

                  {driverOrders.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {driverOrders.map(o => {
                        const oc = (ORDER_COLORS[o.status] || ORDER_COLORS.READY)!;
                        return (
                          <div key={o.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: C.surf2, borderRadius: 10, padding: '8px 12px', border: `1px solid ${C.border}`,
                          }}>
                            <div>
                              <span style={{ fontSize: 11, fontWeight: 700, color: oc.color, fontFamily: C.fontDisplay }}>#{o.orderNumber}</span>
                              <span style={{ fontSize: 11, color: C.textDim, marginLeft: 8 }}>{o.customerName}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              {o.eta && <span style={{ fontSize: 9, color: C.textMuted }}>{o.eta} min</span>}
                              <StatusPill status={o.status} config={oc as any} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {driver.status === 'AVAILABLE' && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
                      <button style={{ ...S.btnSecondary, flex: 1, height: 36, borderRadius: 10, background: C.amberSoft, border: '1px solid rgba(255,184,77,0.28)', color: C.amber }}>
                        Asignar pedido
                      </button>
                      <button style={{ ...S.btnSecondary, flex: 1, height: 36, borderRadius: 10 }}>Ver caja</button>
                    </div>
                  )}
                </div>
              );
            })}

            {drivers.length === 0 && (
              <div style={{ padding: '44px 20px', textAlign: 'center', background: C.surf1, borderRadius: 24, border: `1px dashed ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>Sin repartidores activos</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
