'use client';
// handoff/screens/CajaScreen.tsx
import React from 'react';
import { C, S } from '@/lib/tokens';

interface Movement {
  id: string;
  type: 'INCOME' | 'EXPENSE';
  category?: string;
  description?: string;
  amount: number;
  createdAt: string | Date;
}

interface CajaScreenProps {
  driverId?: string;
  movements: Movement[];
  summary: { balance?: number } | null;
  onBack: () => void;
  onGasto: () => void;
}

export function CajaScreen({ movements, summary, onBack, onGasto }: CajaScreenProps) {
  const balance = summary?.balance || 0;

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Mi Caja</div>
        <button onClick={onGasto} style={{
          height: 34, paddingInline: 14, borderRadius: 10, cursor: 'pointer',
          background: C.amberSoft, border: '1px solid rgba(255,184,77,0.28)',
          fontSize: 9, fontWeight: 700, color: C.amber, letterSpacing: '0.1em', textTransform: 'uppercase',
          fontFamily: C.fontBody,
        }}>+ Gasto</button>
      </div>

      <div style={{ padding: '16px', paddingBottom: 40 }}>
        {/* Balance */}
        <div style={{
          background: 'rgba(136,214,108,0.05)', border: '1px solid rgba(136,214,108,0.18)',
          borderRadius: 24, padding: '36px 20px', textAlign: 'center', marginBottom: 20,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '60%', height: 2, background: 'linear-gradient(90deg, transparent, rgba(136,214,108,0.7), transparent)',
          }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(136,214,108,0.55)', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 12 }}>
            Efectivo en Mano
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 60, fontWeight: 700, color: C.green, letterSpacing: '-0.03em', lineHeight: 1 }}>
            ${balance.toFixed(0)}
          </div>
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 12 }}>
            {[{ label: 'Solicitar retiro', color: C.green, bg: C.greenSoft }, { label: 'Cerrar turno', color: C.textDim, bg: C.surf1 }].map((b, i) => (
              <button key={i} style={{
                height: 38, paddingInline: 16, borderRadius: 10, cursor: 'pointer',
                border: `1px solid ${i === 0 ? 'rgba(136,214,108,0.3)' : C.border}`,
                background: b.bg, fontSize: 9, fontWeight: 700, color: b.color,
                letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.fontBody,
              }}>{b.label}</button>
            ))}
          </div>
        </div>

        <div style={S.sectionLabel}>Historial del día</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {movements.map(m => (
            <div key={m.id} style={{
              background: C.surf1, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: m.type === 'INCOME' ? C.greenSoft : C.coralSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: m.type === 'INCOME' ? C.green : C.coral, fontSize: 16,
                }}>
                  {m.type === 'INCOME' ? '↓' : '↑'}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {m.description || m.category}
                  </div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                    {new Date(m.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div style={{
                fontFamily: C.fontDisplay, fontSize: 17, fontWeight: 700,
                color: m.type === 'INCOME' ? C.green : C.coral,
              }}>
                {m.type === 'INCOME' ? '+' : '−'}${m.amount}
              </div>
            </div>
          ))}
          {movements.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              No hay movimientos hoy
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
