'use client';
// handoff/screens/DetailScreen.tsx
import React from 'react';
import { C, S, ORDER_STATUS_CONFIG } from '@/lib/tokens';
import { whatsappUrl } from '@/lib/phone';

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
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
              <a
                href={whatsappUrl(order.customerPhone, undefined, order?.countryCode)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)',
                  borderRadius: 12, padding: '8px 14px',
                  fontSize: 12, fontWeight: 600, color: '#25d366', textDecoration: 'none',
                }}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </a>
            </div>
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
