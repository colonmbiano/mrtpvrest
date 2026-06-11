'use client';
// handoff/screens/CobrarScreen.tsx
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface CobrarScreenProps {
  order: any;
  onBack: () => void;
  // 'PENDING' = entregar sin cobrar: el pedido queda abierto hasta que la
  // caja confirme el cobro.
  onConfirm: (method: 'CASH' | 'TRANSFER' | 'PENDING') => void;
}

export function CobrarScreen({ order, onBack, onConfirm }: CobrarScreenProps) {
  const [payMethod, setPayMethod] = useState<'CASH' | 'TRANSFER'>('CASH');
  const [cashReceived, setCashReceived] = useState('');
  const total = order?.total || 0;
  const received = parseFloat(cashReceived) || 0;
  const change = received > total ? received - total : 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      {/* Header */}
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Finalizar Entrega</div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 40 }}>

        {/* Total hero */}
        <div style={{
          background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
          borderRadius: 24, padding: '32px 20px', textAlign: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '60%', height: 2, background: C.amber, opacity: 0.5,
          }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: C.textMuted, letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 10 }}>
            Total a Cobrar
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 54, fontWeight: 700, color: C.text, letterSpacing: '-0.03em', lineHeight: 1 }}>
            ${total.toFixed(2)}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
            {order?.customerName} · #{order?.orderNumber}
          </div>
        </div>

        {/* Payment method */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Método de pago</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {([
              { key: 'CASH',     label: 'Efectivo',      icon: '💵' },
              { key: 'TRANSFER', label: 'Transferencia',  icon: '💳' },
            ] as const).map(m => {
              const active = payMethod === m.key;
              return (
                <button key={m.key} onClick={() => setPayMethod(m.key)} style={{
                  flex: 1, height: 72, borderRadius: 16, cursor: 'pointer',
                  border: active ? '1px solid rgba(255,184,77,0.4)' : `1px solid ${C.border}`,
                  background: active ? C.amberSoft : C.surf2,
                  color: active ? C.amber : C.textDim,
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: C.fontBody, transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 22 }}>{m.icon}</span>
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Cash input */}
        {payMethod === 'CASH' && (
          <div style={S.card}>
            <div style={S.sectionLabel}>Efectivo recibido</div>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700,
                color: cashReceived ? C.amber : 'rgba(255,184,77,0.3)', pointerEvents: 'none',
              }}>$</span>
              <input
                type="number" value={cashReceived}
                onChange={e => setCashReceived(e.target.value)}
                placeholder="0.00"
                style={{
                  width: '100%', height: 64, background: C.bg,
                  border: `1px solid ${cashReceived ? 'rgba(255,184,77,0.4)' : C.border}`,
                  borderRadius: 14, paddingLeft: 38, paddingRight: 16,
                  fontFamily: C.fontDisplay, fontSize: 30, fontWeight: 700,
                  color: C.text, outline: 'none', letterSpacing: '-0.02em',
                }}
              />
            </div>
            {change > 0 && (
              <div style={{
                marginTop: 12, padding: '12px 16px',
                background: C.greenSoft, border: '1px solid rgba(136,214,108,0.25)',
                borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: C.green, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                  Cambio a devolver
                </span>
                <span style={{ fontFamily: C.fontDisplay, fontSize: 24, fontWeight: 700, color: C.green }}>
                  ${change.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Confirm */}
        <button onClick={() => onConfirm(payMethod)} style={S.btnSuccess}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
            <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
          CONFIRMAR ENTREGA
        </button>

        {/* Entregar sin cobrar — deja el pedido abierto (por cobrar) para que
            la caja confirme el cobro más tarde. */}
        <button
          onClick={() => onConfirm('PENDING')}
          style={{
            height: 56, borderRadius: 16, cursor: 'pointer',
            background: 'transparent', border: `1px dashed ${C.border}`,
            color: C.textDim, fontFamily: C.fontBody,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Entregar sin cobrar
        </button>
      </div>
    </div>
  );
}
