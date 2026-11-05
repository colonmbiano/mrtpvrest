'use client';
// Login del repartidor INDEPENDIENTE (red del marketplace). El APK solo inicia
// sesión (Bearer de courier); el alta se hace en la web. Ver lib/courierSession.
import React, { useState } from 'react';
import { ArrowLeft, Bike } from 'lucide-react';
import { C, S } from '@/lib/tokens';
import { courierLogin, CourierAuthError } from '@/lib/courierSession';

interface CourierAuthScreenProps {
  onBack: () => void;
  onAuthenticated: () => void;
}

const REGISTER_URL = 'https://mercaditocolorines.mrtpvrest.com/registro';

const ERROR_MESSAGE: Record<string, string> = {
  INVALID_CREDENTIALS: 'Correo o contraseña incorrectos.',
  COURIER_PROFILE_REQUIRED: 'Tu cuenta aún no tiene un perfil de repartidor aprobado.',
  RATE_LIMIT: 'Demasiados intentos. Espera unos minutos.',
  NETWORK: 'Sin conexión. Revisa tu internet e intenta de nuevo.',
  IDENTITY_UNAVAILABLE: 'El servicio de repartidores no está disponible ahora.',
  COURIERS_UNAVAILABLE: 'El servicio de repartidores no está disponible ahora.',
};

export function CourierAuthScreen({ onBack, onAuthenticated }: CourierAuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (busy || !email.trim() || !password) return;
    setBusy(true); setError('');
    try {
      await courierLogin(email, password);
      onAuthenticated();
    } catch (e) {
      const code = e instanceof CourierAuthError ? e.code : 'LOGIN_FAILED';
      setError(ERROR_MESSAGE[code] || 'No se pudo iniciar sesión. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: C.fontBody,
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <button onClick={onBack} style={{ ...S.iconBtn, marginBottom: 20 }} aria-label="Volver">
          <ArrowLeft size={18} />
        </button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 72, height: 72, borderRadius: 22, background: C.greenSoft,
            border: '1px solid rgba(136,214,108,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
          }}>
            <Bike size={32} strokeWidth={2} color={C.green} />
          </div>
          <div style={{ fontFamily: C.fontDisplay, fontSize: 22, fontWeight: 700, color: C.text }}>
            Repartidor independiente
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
            Inicia sesión con tu cuenta de la red
          </div>
        </div>

        <div style={S.card}>
          {error && (
            <div role="alert" style={{
              fontSize: 12, color: '#ef4444', textAlign: 'center', marginBottom: 14,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 10, padding: '10px 12px', lineHeight: 1.4,
            }}>{error}</div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Correo', value: email, onChange: setEmail, type: 'email', placeholder: 'tu@correo.com', name: 'email' },
              { label: 'Contraseña', value: password, onChange: setPassword, type: 'password', placeholder: '••••••••', name: 'password' },
            ].map(f => (
              <div key={f.name}>
                <div style={S.sectionLabel}>{f.label}</div>
                <input
                  type={f.type} value={f.value} autoCapitalize="none" autoCorrect="off"
                  onChange={e => f.onChange(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void submit(); }}
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
              onClick={() => void submit()}
              disabled={busy || !email.trim() || !password}
              style={{ ...S.btnSuccess, marginTop: 8, opacity: busy || !email.trim() || !password ? 0.6 : 1 }}
            >
              {busy ? 'ENTRANDO…' : 'INICIAR SESIÓN'}
            </button>
          </div>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            ¿No tienes cuenta?<br />
            <a href={REGISTER_URL} target="_blank" rel="noopener noreferrer"
              style={{ color: C.green, fontWeight: 700, textDecoration: 'none' }}>
              Regístrate en mrtpvrest.com
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
