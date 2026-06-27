'use client';
// handoff/screens/DesempenoScreen.tsx
import React from 'react';
import { C, S } from '@/lib/tokens';

interface HistoryOrder { id: string; orderNumber: string; total: number; updatedAt: string | Date; }
interface DesempenoScreenProps { history: HistoryOrder[]; onBack: () => void; }

export function DesempenoScreen({ history, onBack }: DesempenoScreenProps) {
  const today = history.filter(h => new Date(h.updatedAt).toDateString() === new Date().toDateString());
  const todayTotal = today.reduce((s, h) => s + (h.total || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Mi Desempeño</div>
      </div>

      <div style={{ padding: '16px', paddingBottom: 40 }}>
        {/* Hero */}
        <div style={{
          background: 'rgba(255,184,77,0.05)', border: '1px solid rgba(255,184,77,0.18)',
          borderRadius: 24, padding: '32px 20px', textAlign: 'center', marginBottom: 16,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
            width: '60%', height: 2, background: 'linear-gradient(90deg, transparent, rgba(255,184,77,0.8), transparent)',
          }} />
          <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,184,77,0.55)', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 8 }}>
            Entregas Hoy
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 84, fontWeight: 700, color: C.text, lineHeight: 1, letterSpacing: '-0.03em' }}>
            {today.length}
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.green, marginTop: 12 }}>
            ${todayTotal.toFixed(2)}
            <span style={{ fontSize: 11, color: C.textMuted, fontFamily: C.fontBody, fontWeight: 400 }}> recaudados</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Tiempo medio', value: '—' },
            { label: 'Km recorridos', value: '—' },
            { label: 'Calificación',  value: '—' },
          ].map((s, i) => (
            <div key={i} style={{
              flex: 1, background: C.surf1, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '14px 8px', textAlign: 'center',
            }}>
              <div style={{ fontFamily: C.fontDisplay, fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 8, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* History */}
        <div style={S.sectionLabel}>Historial de hoy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {today.map(h => (
            <div key={h.id} style={{
              background: C.surf1, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, background: C.greenSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.green,
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>#{h.orderNumber}</div>
                  <div style={{ fontSize: 9, color: C.textMuted, marginTop: 2 }}>
                    {new Date(h.updatedAt).toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: C.fontDisplay, fontSize: 16, fontWeight: 700, color: C.text }}>${h.total?.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: C.green, fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>Entregado</div>
              </div>
            </div>
          ))}
          {today.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              No hay entregas registradas hoy
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
