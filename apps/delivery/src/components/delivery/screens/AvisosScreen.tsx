'use client';
// handoff/screens/AvisosScreen.tsx
// Apartado de Avisos: mensajes que el restaurante envía a los repartidores
// (dirigidos o broadcast). Al abrir la pantalla se marcan como leídos.
import React, { useEffect } from 'react';
import { C, S } from '@/lib/tokens';

interface Notice {
  id: string;
  title?: string | null;
  body: string;
  createdByName?: string | null;
  createdAt: string | Date;
  read?: boolean;
}

interface AvisosScreenProps {
  avisos: Notice[];
  onBack: () => void;
  onRead: (noticeId: string) => void;
}

export function AvisosScreen({ avisos, onBack, onRead }: AvisosScreenProps) {
  // Al abrir la pantalla, marcar como leídos los avisos no leídos (limpia el badge).
  useEffect(() => {
    avisos.filter(a => !a.read).forEach(a => onRead(a.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Avisos</div>
      </div>

      <div style={{ padding: '16px', paddingBottom: 40 }}>
        {avisos.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: 18, margin: '0 auto 16px',
              background: 'rgba(255,184,77,0.08)', border: '1px solid rgba(255,184,77,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,184,77,0.7)',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              No tienes avisos
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {avisos.map(a => {
              const unread = !a.read;
              return (
                <div key={a.id} style={{
                  background: unread ? 'rgba(255,184,77,0.06)' : C.surf1,
                  border: `1px solid ${unread ? 'rgba(255,184,77,0.28)' : C.border}`,
                  borderRadius: 16, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {unread && (
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ffb84d', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: C.text }}>
                      {a.title || 'Aviso'}
                    </div>
                    <div style={{ fontSize: 9, color: C.textMuted }}>
                      {new Date(a.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      {' · '}
                      {new Date(a.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: C.text, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                    {a.body}
                  </div>
                  {a.createdByName && (
                    <div style={{ fontSize: 9, color: C.textMuted, marginTop: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      — {a.createdByName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
