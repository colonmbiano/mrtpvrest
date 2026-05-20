'use client';
// handoff/screens/HomeScreen.tsx
import React from 'react';
import { C, S, ORDER_STATUS_CONFIG } from '@/lib/tokens';

interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  deliveryAddress: string;
  status: string;
  total: number;
}

interface Driver {
  id: string;
  name: string;
}

interface HomeScreenProps {
  driver: Driver | null;
  orders: Order[];
  isOnline: boolean;
  pendingSync?: number;
  onSelectOrder: (order: Order) => void;
  onChat: (order: Order) => void;
  onDeliverOrder: (order: Order) => void;
  onNavigate: (screen: string) => void;
}

function OrderCard({ order, onDetail, onChat, onDeliver, onNavigate }: {
  order: Order;
  onDetail: () => void;
  onChat: () => void;
  onDeliver: () => void;
  onNavigate: (s: string) => void;
}) {
  const st = (ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.PENDING)!;
  const isOnTheWay = order.status === 'ON_THE_WAY';
  const isReady    = order.status === 'READY';

  return (
    <div style={{
      background: C.surf1, borderRadius: 24, border: `1px solid ${C.border}`,
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Accent stripe */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: isOnTheWay ? C.amber : isReady ? C.iris : C.green,
      }} />

      <div style={{ padding: '16px 16px 16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.amber, lineHeight: 1 }}>
              #{order.orderNumber}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, marginTop: 4 }}>
              {order.customerName}
            </div>
          </div>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: 20, flexShrink: 0,
            background: st.bg, color: st.color, border: `1px solid ${st.color}30`,
          }}>{st.label}</span>
        </div>

        {/* Address */}
        <div style={{
          display: 'flex', gap: 8, alignItems: 'flex-start',
          background: C.bg, borderRadius: 12, padding: '10px 12px', marginBottom: 14,
          border: `1px solid ${C.border}`,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="13" height="13"
            style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span style={{ fontSize: 11, color: C.textDim, lineHeight: 1.55, fontWeight: 500 }}>
            {order.deliveryAddress}
          </span>
        </div>

        {/* Actions row */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            flex: 1, fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700,
            color: isOnTheWay ? C.amber : C.green, letterSpacing: '-0.01em',
          }}>
            ${(order.total || 0).toFixed(2)}
          </div>

          <button onClick={onDetail} style={{ ...S.btnSecondary }}>Detalle</button>

          <button onClick={onChat} style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0, cursor: 'pointer',
            border: '1px solid rgba(167,139,250,0.25)',
            background: 'rgba(167,139,250,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.iris,
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
          </button>

          {isReady && (
            <button onClick={onDetail} style={{
              height: 40, paddingInline: 12, borderRadius: 11, cursor: 'pointer',
              border: '1px solid rgba(167,139,250,0.3)',
              background: 'rgba(167,139,250,0.1)',
              fontSize: 9, fontWeight: 700, color: C.iris,
              letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
            }}>Recoger</button>
          )}

          {isOnTheWay && (
            <button onClick={onDeliver} style={{
              height: 40, paddingInline: 12, borderRadius: 11, cursor: 'pointer',
              border: '1px solid rgba(136,214,108,0.3)',
              background: 'rgba(136,214,108,0.1)',
              fontSize: 9, fontWeight: 700, color: C.green,
              letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0,
            }}>Entregar</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function HomeScreen({
  driver, orders, isOnline, pendingSync = 0,
  onSelectOrder, onChat, onDeliverOrder, onNavigate,
}: HomeScreenProps) {

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={{
          width: 44, height: 44, borderRadius: 14, flexShrink: 0,
          background: C.amberSoft, border: '1px solid rgba(255,184,77,0.22)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
            <circle cx="5.5" cy="17.5" r="3"/><circle cx="18.5" cy="17.5" r="3"/>
            <path d="M15 6h-3L9.5 10.5 7 14"/><path d="M9.5 14H15.5"/><path d="M13 6h2.5l3 5.5"/>
          </svg>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {driver?.name || 'Repartidor'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isOnline ? C.green : C.coral,
              boxShadow: isOnline ? '0 0 6px rgba(136,214,108,0.8)' : 'none',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              color: isOnline ? C.green : C.coral }}>
              {isOnline ? 'En Línea' : `Offline${pendingSync > 0 ? ` · ${pendingSync} pend.` : ''}`}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { icon: 'map', onClick: () => onNavigate('map'), color: C.textDim },
            { icon: 'stats', onClick: () => onNavigate('weekly'), color: C.textDim },
            { icon: 'wallet', onClick: () => onNavigate('caja'), color: C.green },
            { icon: 'logout', onClick: () => onNavigate('login'), color: C.coral,
              bg: 'rgba(255,92,51,0.05)', border: '1px solid rgba(255,92,51,0.2)' },
          ].map((btn, i) => (
            <button key={i} onClick={btn.onClick} style={{
              ...S.iconBtn,
              color: btn.color,
              background: (btn as any).bg || C.surf1,
              border: (btn as any).border || `1px solid ${C.border}`,
            }}>
              {/* Replace with lucide-react icons in actual implementation */}
              {btn.icon === 'map' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                  <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                </svg>
              )}
              {btn.icon === 'stats' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
                  <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              )}
              {btn.icon === 'wallet' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
                  <rect x="2" y="7" width="20" height="14" rx="2"/>
                  <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
                </svg>
              )}
              {btn.icon === 'logout' && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="15" height="15">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Offline banner ── */}
      {!isOnline && (
        <div style={{
          padding: '7px 16px', background: 'rgba(255,92,51,0.1)',
          borderBottom: '1px solid rgba(255,92,51,0.25)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.coral, flexShrink: 0 }} />
          <span style={{ fontSize: 9, fontWeight: 700, color: C.coral, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Sin conexión — {pendingSync} {pendingSync === 1 ? 'acción pendiente' : 'acciones pendientes'}
          </span>
        </div>
      )}

      {/* ── Ticker ── */}
      <div style={{ padding: '8px 0', background: 'rgba(255,255,255,0.015)', borderBottom: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <div style={{
          fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.33)',
          letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
          paddingLeft: 16, display: 'inline-block',
          animation: 'marquee 22s linear infinite',
        }}>
          Maneja con precaución &nbsp;·&nbsp; ¡Buen turno, {driver?.name?.split(' ')[0] || 'repartidor'}!
        </div>
      </div>

      {/* ── Daily metrics ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{
          background: 'linear-gradient(135deg, rgba(255,184,77,0.09) 0%, rgba(255,184,77,0.04) 100%)',
          border: '1px solid rgba(255,184,77,0.18)', borderRadius: 20, padding: '16px',
          display: 'flex',
        }}>
          {[
            { label: 'Completadas', value: '—' },
            { label: 'En mano',     value: '—' },
            { label: 'Comisión',    value: '—' },
          ].map((m, i) => (
            <div key={i} style={{
              flex: 1, textAlign: 'center',
              borderRight: i < 2 ? '1px solid rgba(255,184,77,0.15)' : 'none',
            }}>
              <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.amber, lineHeight: 1 }}>
                {m.value}
              </div>
              <div style={{ fontSize: 8, color: 'rgba(255,184,77,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 6 }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Orders ── */}
      <div style={{ padding: '20px 16px 32px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={S.sectionLabel}>Ruta Activa</div>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>
              {orders.length}{' '}
              <span style={{ fontSize: 13, color: C.textDim, fontFamily: C.fontBody, fontWeight: 400 }}>pedidos</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onDetail={() => onSelectOrder(order)}
              onChat={() => onChat(order)}
              onDeliver={() => onDeliverOrder(order)}
              onNavigate={onNavigate}
            />
          ))}

          {orders.length === 0 && (
            <div style={{
              padding: '44px 20px', textAlign: 'center',
              background: C.surf1, borderRadius: 24, border: `1px dashed ${C.border}`,
            }}>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 700 }}>
                Esperando nuevas órdenes…
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
