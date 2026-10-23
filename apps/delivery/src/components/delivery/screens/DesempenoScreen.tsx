'use client';
import React, { useState, useEffect } from 'react';
import { C, S } from '@/lib/tokens';

interface HistoryOrder {
  id: string;
  orderNumber: string;
  total: number;
  tariff: number;
  tip: number;
  cash: number;
  paymentMethod: 'CASH' | 'CARD' | 'TRANSFER';
  status: 'DELIVERED' | 'CANCELLED' | 'PENDING';
  updatedAt: string | Date;
}

interface DesempenoScreenProps {
  history: HistoryOrder[];
  onBack: () => void;
  offline?: boolean;
}

const CACHE_KEY = 'delivery:balance:history';

export function DesempenoScreen({ history, onBack, offline = false }: DesempenoScreenProps) {
  const [cachedHistory, setCachedHistory] = useState<HistoryOrder[]>(history);
  const [isOffline, setIsOffline] = useState(offline);

  useEffect(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(history));
    } catch {}
  }, [history]);

  useEffect(() => {
    if (history.length === 0 && typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          setCachedHistory(JSON.parse(cached));
          setIsOffline(true);
        }
      } catch {}
    }
  }, [history]);

  const displayHistory = history.length > 0 ? history : cachedHistory;
  const today = displayHistory.filter(h => new Date(h.updatedAt).toDateString() === new Date().toDateString());
  const delivered = today.filter(h => h.status === 'DELIVERED');

  const todayTariff = delivered.reduce((s, h) => s + (h.tariff || 0), 0);
  const todayTips = delivered.reduce((s, h) => s + (h.tip || 0), 0);
  const todayEarnings = todayTariff + todayTips;
  const todayAvailable = delivered.filter(h => h.paymentMethod !== 'CASH').reduce((s, h) => s + (h.total || 0), 0);
  const todayCash = delivered.filter(h => h.paymentMethod === 'CASH').reduce((s, h) => s + (h.cash || 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>
          Mi Desempeño
          {isOffline && <span style={{ marginLeft: 8, fontSize: 10, color: C.textMuted }}>📡 Sin conexión</span>}
        </div>
      </div>

      <div style={{ padding: '16px', paddingBottom: 40 }}>
        {/* Entregas Hoy */}
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
            {delivered.length}
          </div>
        </div>

        {/* Tarjetas de Balance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {/* Saldo Ganado */}
          <div style={{
            background: C.greenSoft, border: `1px solid ${C.green}40`,
            borderRadius: 16, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Saldo Ganado
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontFamily: C.fontDisplay, fontSize: 28, fontWeight: 700, color: C.green }}>
                ${todayEarnings.toFixed(2)}
              </div>
              <div style={{ fontSize: 9, color: C.textMuted }}>
                Tarifas ${todayTariff.toFixed(2)} + Propinas ${todayTips.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Saldo Disponible */}
          <div style={{
            background: 'rgba(59,130,246,0.05)', border: `1px solid rgba(59,130,246,0.25)`,
            borderRadius: 16, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Saldo Disponible
            </div>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 28, fontWeight: 700, color: '#3b82f6' }}>
              ${todayAvailable.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4 }}>Pagos con tarjeta y transferencias</div>
          </div>

          {/* Efectivo Pendiente */}
          <div style={{
            background: 'rgba(239,68,68,0.05)', border: `1px solid rgba(239,68,68,0.25)`,
            borderRadius: 16, padding: '16px 20px',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
              Efectivo Pendiente de Caja
            </div>
            <div style={{ fontFamily: C.fontDisplay, fontSize: 28, fontWeight: 700, color: '#ef4444' }}>
              ${todayCash.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4 }}>Debe liquidarse en caja</div>
          </div>
        </div>

        {/* Historial Detallado */}
        <div style={S.sectionLabel}>Historial de hoy</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {delivered.map(h => (
            <div key={h.id} style={{
              background: C.surf1, border: `1px solid ${C.border}`,
              borderRadius: 16, padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                  <div style={{ fontFamily: C.fontDisplay, fontSize: 16, fontWeight: 700, color: C.text }}>
                    ${h.total?.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 9, color: C.green, fontWeight: 600, marginTop: 2, textTransform: 'uppercase' }}>Entregado</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, fontSize: 9, color: C.textMuted, borderTop: `1px solid ${C.border}40`, paddingTop: 8 }}>
                <span>Tarifa: <strong style={{ color: C.text }}>${h.tariff?.toFixed(2)}</strong></span>
                <span>Propina: <strong style={{ color: C.green }}>${h.tip?.toFixed(2)}</strong></span>
                <span>Método: <strong style={{ color: C.text }}>{h.paymentMethod === 'CASH' ? '💵 Efectivo' : h.paymentMethod === 'CARD' ? '💳 Tarjeta' : '🏦 Transfer'}</strong></span>
              </div>
            </div>
          ))}
          {delivered.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', fontSize: 10, color: C.textMuted, letterSpacing: '0.15em', textTransform: 'uppercase' }}>
              No hay entregas entregadas hoy
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
