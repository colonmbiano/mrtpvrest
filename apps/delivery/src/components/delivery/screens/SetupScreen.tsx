'use client';
// handoff/screens/SetupScreen.tsx
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface SetupScreenProps {
  step: 'auth' | 'location';
  locations: Array<{ id: string; name: string }>;
  loggingIn: boolean;
  onLogin: (email: string, password: string) => void;
  onSelectLocation: (loc: { id: string; name: string }) => void;
}

export function SetupScreen({ step, locations, loggingIn, onLogin, onSelectLocation }: SetupScreenProps) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: C.fontBody,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Icon */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22, background: C.amberSoft,
            border: '1px solid rgba(255,184,77,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.07 4.93a10 10 0 010 14.14M14.83 9.17a4 4 0 010 5.66"/>
              <path d="M4.93 4.93a10 10 0 000 14.14M9.17 9.17a4 4 0 000 5.66"/>
            </svg>
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.text }}>
            Configuración
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Vincula esta app con tu sucursal
          </div>
        </div>

        {/* Auth step */}
        {step === 'auth' && (
          <div style={S.card}>
            <div style={{ ...S.sectionLabel, textAlign: 'center', marginBottom: 20 }}>
              Paso 1 — Autenticación admin
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Email administrador', value: email, onChange: setEmail, type: 'email', placeholder: 'dueño@ejemplo.com' },
                { label: 'Contraseña', value: password, onChange: setPassword, type: 'password', placeholder: '••••••••' },
              ].map(f => (
                <div key={f.label}>
                  <div style={S.sectionLabel}>{f.label}</div>
                  <input type={f.type} value={f.value} onChange={e => f.onChange(e.target.value)}
                    placeholder={f.placeholder}
                    style={{
                      width: '100%', height: 52, background: C.bg,
                      border: `1px solid ${C.border}`, borderRadius: 12,
                      padding: '0 14px', fontSize: 14, color: C.text,
                      fontFamily: C.fontBody, outline: 'none',
                    }} />
                </div>
              ))}
              <button
                onClick={() => onLogin(email, password)}
                disabled={loggingIn || !email || !password}
                style={{ ...S.btnPrimary, marginTop: 8 }}
              >
                {loggingIn ? 'VERIFICANDO…' : 'CONTINUAR'}
              </button>
            </div>
          </div>
        )}

        {/* Location step */}
        {step === 'location' && (
          <div style={S.card}>
            <div style={{ ...S.sectionLabel, textAlign: 'center', marginBottom: 20 }}>
              Paso 2 — Selecciona tu sucursal
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 300, overflowY: 'auto' }}>
              {locations.map(loc => (
                <button key={loc.id} onClick={() => onSelectLocation(loc)} style={{
                  height: 52, borderRadius: 12, cursor: 'pointer',
                  background: C.surf2, border: `1px solid ${C.border}`,
                  fontSize: 13, fontWeight: 600, color: C.text,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  fontFamily: C.fontBody, transition: 'all 0.15s',
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2"
                    strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                    <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  {loc.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
