'use client';
// handoff/screens/LoginScreen.tsx
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface LoginScreenProps {
  locationName?: string;
  onLogin: (pin: string) => void;
  loggingIn?: boolean;
  loginError?: string;
}

export function LoginScreen({ locationName = 'Sucursal', onLogin, loggingIn, loginError }: LoginScreenProps) {
  const [pin, setPin] = useState('');

  const handleKey = (k: string) => {
    if (k === '⌫') {
      setPin(p => p.slice(0, -1));
    } else if (pin.length < 4) {
      const next = pin + k;
      setPin(next);
      if (next.length === 4) setTimeout(() => onLogin(next), 400);
    }
  };

  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0 28px 40px', position: 'relative', overflow: 'hidden',
      fontFamily: C.fontBody,
    }}>
      {/* Amber glow */}
      <div style={{
        position: 'absolute', top: -100, left: '50%', transform: 'translateX(-50%)',
        width: 360, height: 360, borderRadius: '50%', pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(255,184,77,0.14) 0%, transparent 70%)',
      }} />

      <div style={{ flex: '0 0 60px' }} />

      {/* Icon */}
      <div style={{
        width: 80, height: 80, borderRadius: 28, background: C.amber,
        marginBottom: 22, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 24px 64px rgba(255,184,77,0.40)',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="#0A0A0C" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round" width="42" height="42">
          <circle cx="5.5" cy="17.5" r="3.2" />
          <circle cx="18.5" cy="17.5" r="3.2" />
          <path d="M15 6h-3L9.5 10.5 7 14" />
          <path d="M9.5 14H15.5" />
          <path d="M13 6h2.5l3 5.5" />
        </svg>
      </div>

      <div style={{
        fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700,
        color: C.text, letterSpacing: '-0.02em', marginBottom: 6, textAlign: 'center',
      }}>MRTPV Delivery</div>

      <div style={{
        fontSize: 10, fontWeight: 700, color: C.amber,
        letterSpacing: '0.26em', textTransform: 'uppercase',
        marginBottom: 44, opacity: 0.7, textAlign: 'center',
      }}>{locationName}</div>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 36, alignItems: 'center' }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 13, height: 13, borderRadius: '50%',
            background: i < pin.length ? C.amber : 'transparent',
            border: `2px solid ${i < pin.length ? C.amber : 'rgba(255,255,255,0.18)'}`,
            boxShadow: i < pin.length ? '0 0 16px rgba(255,184,77,0.7)' : 'none',
            transition: 'all 0.15s cubic-bezier(.4,0,.2,1)',
          }} />
        ))}
      </div>

      {/* Keypad */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 10, width: '100%', marginBottom: 20,
      }}>
        {keys.map((k, i) => (
          <button key={i} onClick={() => k !== '' && handleKey(k)} style={{
            height: 68, borderRadius: 18,
            cursor: k === '' ? 'default' : 'pointer',
            border: k === '' ? 'none'
              : k === '⌫' ? '1px solid rgba(255,92,51,0.2)'
              : `1px solid ${C.border}`,
            background: k === '' ? 'transparent'
              : k === '⌫' ? 'rgba(255,92,51,0.08)'
              : C.surf1,
            color: k === '⌫' ? C.coral : C.text,
            fontSize: 22, fontWeight: 600, fontFamily: C.fontBody,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: k === '' ? 'none' : 'auto',
          }}>{k}</button>
        ))}
      </div>

      {/* ACCEDER */}
      <button
        onClick={() => pin.length >= 4 && !loggingIn && onLogin(pin)}
        disabled={loggingIn}
        style={{
          ...S.btnPrimary,
          background: pin.length >= 4 ? C.amber : C.amberSoft,
          color: pin.length >= 4 ? '#090909' : 'rgba(255,184,77,0.35)',
          boxShadow: pin.length >= 4 ? '0 16px 48px rgba(255,184,77,0.35)' : 'none',
          marginBottom: 16,
          opacity: loggingIn ? 0.6 : 1,
        }}
      >{loggingIn ? 'VALIDANDO…' : 'ACCEDER'}</button>

      {loginError ? (
        <div style={{ fontSize: 11, color: C.coral, textAlign: 'center', marginBottom: 8 }}>
          {loginError}
        </div>
      ) : (
        <div style={{ fontSize: 10, color: C.textMuted, textAlign: 'center' }}>
          Ingresa tu PIN de 4 dígitos
        </div>
      )}

      <div style={{ flex: 1, minHeight: 32 }} />

      <button
        onClick={() => { localStorage.clear(); window.location.reload(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 9, color: C.textMuted, letterSpacing: '0.12em',
          textTransform: 'uppercase', textDecoration: 'underline', opacity: 0.6,
        }}
      >Configuración de terminal</button>
    </div>
  );
}
