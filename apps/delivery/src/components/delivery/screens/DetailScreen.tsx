'use client';
// handoff/screens/DetailScreen.tsx
import React from 'react';
import { C, S, ORDER_STATUS_CONFIG } from '@/lib/tokens';

interface DetailScreenProps {
  order: any;
  orderDetail?: any;
  onBack: () => void;
  onCobrar: () => void;
  onChat: () => void;
}

function BackHeader({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <div style={S.header}>
      <button onClick={onBack} style={S.iconBtn}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
      </button>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>{title}</div>
      {right}
    </div>
  );
}

export function DetailScreen({ order, orderDetail, onBack, onCobrar, onChat }: DetailScreenProps) {
  const items = (order?.items?.length ? order.items : orderDetail?.items) || [];
  const total = order?.total || 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <BackHeader title={`Orden #${order?.orderNumber || ''}`} onBack={onBack} right={
        <button onClick={onChat} style={{
          width: 40, height: 40, borderRadius: 12, cursor: 'pointer',
          border: '1px solid rgba(167,139,250,0.28)', background: C.irisSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.iris,
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
          </svg>
        </button>
      } />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 40 }}>
        {/* Cliente */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Datos del cliente</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 14 }}>
            {order?.customerName}
          </div>
          {order?.customerPhone && (
            <a href={`tel:${order.customerPhone}`} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: C.amberSoft, border: '1px solid rgba(255,184,77,0.25)',
              borderRadius: 12, padding: '8px 14px',
              fontSize: 12, fontWeight: 600, color: C.amber, textDecoration: 'none',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.4 9.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.32 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
              </svg>
              {order.customerPhone}
            </a>
          )}
        </div>

        {/* Dirección */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Ubicación de entrega</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="15" height="15"
              style={{ flexShrink: 0, marginTop: 2 }}>
              <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6 }}>
              {order?.deliveryAddress || 'Sin dirección registrada'}
            </span>
          </div>
          <button style={{ ...S.btnSecondary, width: '100%', height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" width="13" height="13">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            Abrir en Mapas
          </button>
        </div>

        {/* Items */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Contenido del pedido</div>
          {items.map((item: any, i: number) => {
            const name = item.name || item.productName || item.menuItem?.name || 'Producto';
            const lineTotal = item.subtotal ?? (item.price ?? 0) * (item.quantity ?? 0);
            return (
              <div key={item.id || i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberSoft, borderRadius: 6, padding: '2px 7px' }}>
                    {item.quantity}x
                  </span>
                  <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{name}</span>
                </div>
                <span style={{ fontSize: 13, color: C.textDim, fontWeight: 600 }}>
                  ${Number(lineTotal).toFixed(2)}
                </span>
              </div>
            );
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.borderStrong}` }}>
            <span style={S.sectionLabel}>Total</span>
            <span style={{ fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700, color: C.green }}>
              ${total.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Excepciones */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { label: 'No contesta',  color: C.coral, bg: C.coralSoft, borderC: 'rgba(255,92,51,0.28)' },
            { label: 'Dir. errónea', color: C.warn,  bg: C.warnSoft,  borderC: 'rgba(245,158,11,0.28)' },
          ].map((e, i) => (
            <button key={i} style={{
              flex: 1, height: 42, borderRadius: 12, cursor: 'pointer',
              border: `1px solid ${e.borderC}`, background: e.bg,
              fontSize: 9, fontWeight: 700, color: e.color,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              fontFamily: C.fontBody,
            }}>{e.label}</button>
          ))}
        </div>

        {/* CTA */}
        {order?.status === 'ON_THE_WAY' && (
          <button onClick={onCobrar} style={S.btnSuccess}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            CONFIRMAR ENTREGA
          </button>
        )}
      </div>
    </div>
  );
}
