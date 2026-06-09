'use client';
// handoff/screens/CajaScreen.tsx
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface Movement {
  id: string;
  type: 'INCOME' | 'EXPENSE' | 'RETURN' | 'FLOAT';
  category?: string;
  description?: string;
  amount: number;
  createdAt: string | Date;
}

interface CajaScreenProps {
  driverId?: string;
  movements: Movement[];
  summary: { balance?: number; float?: number; income?: number; expense?: number } | null;
  onBack: () => void;
  onGasto: () => void;
  // Registra un retiro de efectivo (movimiento RETURN) que baja el balance.
  onRetiro: (amount: number) => Promise<void> | void;
  // Avisa al admin que el repartidor quiere cerrar turno. Devuelve true si se envió.
  onCerrarTurno: () => Promise<boolean> | boolean;
}

export function CajaScreen({ movements, summary, onBack, onGasto, onRetiro, onCerrarTurno }: CajaScreenProps) {
  const balance = summary?.balance || 0;
  const fondo = summary?.float || 0;
  const cobrado = summary?.income || 0;
  const gastos = summary?.expense || 0;

  const [retiroOpen, setRetiroOpen] = useState(false);
  const [retiroAmount, setRetiroAmount] = useState('');
  const [retiroBusy, setRetiroBusy] = useState(false);

  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cerrarBusy, setCerrarBusy] = useState(false);
  const [cerrarSent, setCerrarSent] = useState(false);

  async function confirmRetiro() {
    const n = Number(retiroAmount);
    if (!Number.isFinite(n) || n <= 0) return;
    setRetiroBusy(true);
    try {
      await onRetiro(n);
      setRetiroOpen(false);
      setRetiroAmount('');
    } finally { setRetiroBusy(false); }
  }

  async function confirmCerrar() {
    setCerrarBusy(true);
    try {
      const ok = await onCerrarTurno();
      if (ok) setCerrarSent(true);
    } finally { setCerrarBusy(false); }
  }

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

          {/* Desglose: el efectivo en mano = fondo + cobrado − gastos − retiros */}
          <div style={{
            marginTop: 16, display: 'flex', justifyContent: 'center', gap: 0,
            borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14,
          }}>
            {[
              { label: 'Fondo', value: fondo, color: C.iris },
              { label: 'Cobrado', value: cobrado, color: C.green },
              { label: 'Gastos', value: gastos, color: C.coral },
            ].map((it, i) => (
              <div key={it.label} style={{
                flex: 1, textAlign: 'center',
                borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
              }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: C.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3 }}>{it.label}</div>
                <div style={{ fontFamily: C.fontDisplay, fontSize: 16, fontWeight: 700, color: it.color }}>${it.value.toFixed(0)}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, display: 'flex', justifyContent: 'center', gap: 12 }}>
            <button onClick={() => { setRetiroAmount(balance > 0 ? String(balance.toFixed(0)) : ''); setRetiroOpen(true); }} style={{
              height: 38, paddingInline: 16, borderRadius: 10, cursor: 'pointer',
              border: '1px solid rgba(136,214,108,0.3)',
              background: C.greenSoft, fontSize: 9, fontWeight: 700, color: C.green,
              letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.fontBody,
            }}>Solicitar retiro</button>
            <button onClick={() => { setCerrarSent(false); setCerrarOpen(true); }} style={{
              height: 38, paddingInline: 16, borderRadius: 10, cursor: 'pointer',
              border: `1px solid ${C.border}`,
              background: C.surf1, fontSize: 9, fontWeight: 700, color: C.textDim,
              letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: C.fontBody,
            }}>Cerrar turno</button>
          </div>
        </div>

        <div style={S.sectionLabel}>Historial del día</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {movements.map(m => {
            const isFloat = m.type === 'FLOAT';
            const positive = m.type === 'INCOME' || isFloat;
            const tone = isFloat ? C.iris : positive ? C.green : C.coral;
            const toneSoft = isFloat ? C.irisSoft : positive ? C.greenSoft : C.coralSoft;
            return (
            <div key={m.id} style={{
              background: C.surf1, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '12px 16px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                  background: toneSoft,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: tone, fontSize: 16,
                }}>
                  {isFloat ? '💵' : positive ? '↓' : '↑'}
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
                fontFamily: C.fontDisplay, fontSize: 17, fontWeight: 700, color: tone,
              }}>
                {positive ? '+' : '−'}${m.amount}
              </div>
            </div>
            );
          })}
          {movements.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              No hay movimientos hoy
            </div>
          )}
        </div>
      </div>

      {/* Modal · Solicitar retiro (registra movimiento RETURN) */}
      {retiroOpen && (
        <div style={modalOverlay} onClick={() => !retiroBusy && setRetiroOpen(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Retiro de efectivo</div>
            <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18, lineHeight: 1.5 }}>
              Registra el efectivo que entregas. Baja tu saldo en mano al instante.
            </div>
            <div style={{ position: 'relative', marginBottom: 18 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                fontFamily: C.fontDisplay, fontSize: 24, fontWeight: 700,
                color: retiroAmount ? C.green : 'rgba(136,214,108,0.3)', pointerEvents: 'none',
              }}>$</span>
              <input type="number" inputMode="decimal" autoFocus value={retiroAmount}
                onChange={e => setRetiroAmount(e.target.value)} placeholder="0"
                style={{
                  width: '100%', height: 60, background: C.bg,
                  border: `1px solid ${retiroAmount ? 'rgba(136,214,108,0.4)' : C.border}`,
                  borderRadius: 14, paddingLeft: 36, paddingRight: 16,
                  fontFamily: C.fontDisplay, fontSize: 28, fontWeight: 700,
                  color: C.text, outline: 'none', letterSpacing: '-0.02em', boxSizing: 'border-box',
                }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRetiroOpen(false)} disabled={retiroBusy} style={modalBtnGhost}>Cancelar</button>
              <button onClick={confirmRetiro} disabled={retiroBusy || !(Number(retiroAmount) > 0)} style={{
                ...modalBtnSolid,
                background: Number(retiroAmount) > 0 ? C.green : C.greenSoft,
                color: Number(retiroAmount) > 0 ? '#0A0A0A' : 'rgba(136,214,108,0.4)',
              }}>{retiroBusy ? '...' : 'Registrar retiro'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal · Cerrar turno (avisa al admin) */}
      {cerrarOpen && (
        <div style={modalOverlay} onClick={() => !cerrarBusy && setCerrarOpen(false)}>
          <div style={modalCard} onClick={e => e.stopPropagation()}>
            {cerrarSent ? (
              <>
                <div style={{ fontSize: 40, textAlign: 'center', marginBottom: 10 }}>
                  <span style={{ color: C.green }}>✓</span>
                </div>
                <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.text, textAlign: 'center', marginBottom: 6 }}>
                  Solicitud enviada
                </div>
                <div style={{ fontSize: 12, color: C.textDim, textAlign: 'center', marginBottom: 18, lineHeight: 1.5 }}>
                  El administrador recibió tu aviso y hará el corte de caja.
                </div>
                <button onClick={() => setCerrarOpen(false)} style={{ ...modalBtnSolid, background: C.green, color: '#0A0A0A' }}>
                  Entendido
                </button>
              </>
            ) : (
              <>
                <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>Cerrar turno</div>
                <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18, lineHeight: 1.5 }}>
                  Se enviará un aviso al administrador con tu efectivo en mano (<b style={{ color: C.green }}>${balance.toFixed(0)}</b>) para que haga el corte de caja.
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setCerrarOpen(false)} disabled={cerrarBusy} style={modalBtnGhost}>Cancelar</button>
                  <button onClick={confirmCerrar} disabled={cerrarBusy} style={{ ...modalBtnSolid, background: C.amber, color: '#0A0A0A' }}>
                    {cerrarBusy ? '...' : 'Enviar aviso'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const modalOverlay: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(9,9,11,0.88)', backdropFilter: 'blur(16px)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16,
};

const modalCard: React.CSSProperties = {
  width: '100%', maxWidth: 420, background: C.surf1,
  border: `1px solid ${C.border}`, borderRadius: 24, padding: 22,
  marginBottom: 8, fontFamily: C.fontBody,
};

const modalBtnGhost: React.CSSProperties = {
  flex: 1, height: 50, borderRadius: 14, cursor: 'pointer',
  background: 'transparent', border: `1px solid ${C.border}`,
  fontSize: 13, fontWeight: 700, color: C.textDim, fontFamily: C.fontBody,
};

const modalBtnSolid: React.CSSProperties = {
  flex: 1.4, height: 50, borderRadius: 14, cursor: 'pointer', border: 'none',
  fontSize: 13, fontWeight: 700, fontFamily: C.fontBody,
};
