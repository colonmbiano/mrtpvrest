'use client';

import React, { useState } from 'react';
import { C } from '@/lib/tokens';

interface PinVerificationModalProps {
  type: 'PICKUP' | 'DELIVERY';
  orderNumber: string;
  targetName: string; // Nombre de la tienda (en pickup) o cliente (en delivery)
  onConfirm: (pin: string) => Promise<{ success: boolean; error?: string }>;
  onCancel: () => void;
}

export function PinVerificationModal({
  type,
  orderNumber,
  targetName,
  onConfirm,
  onCancel,
}: PinVerificationModalProps) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const isPinValid = /^\d{4,6}$/.test(pin);

  const isPickup = type === 'PICKUP';
  const accent = isPickup ? C.amber : C.green;
  const title = isPickup ? 'Confirmar Recolección' : 'Confirmar Entrega';
  const subtitle = isPickup
    ? `Solicita el PIN de 4 a 6 dígitos en ${targetName}`
    : `Solicita el PIN de 4 a 6 dígitos a ${targetName}`;

  const handleDigit = (digit: string) => {
    if (loading || !/^\d$/.test(digit)) return;
    setErrorMsg('');
    setPin(current => current.length >= 6 ? current : current + digit);
  };

  const handleDelete = () => {
    if (loading || pin.length === 0) return;
    setErrorMsg('');
    setPin(current => current.slice(0, -1));
  };

  const handleClear = () => {
    if (loading) return;
    setErrorMsg('');
    setPin('');
  };

  const handleSubmit = async () => {
    if (!isPinValid || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const result = await onConfirm(pin);
      if (!result.success) {
        setErrorMsg(result.error || 'PIN incorrecto. Verifica con quien entrega/recibe.');
        setPin('');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error de conexión.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(247, 249, 248, 0.98)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 20px',
        fontFamily: C.fontBody,
      }}
    >
      {/* Header */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <button
            onClick={onCancel}
            disabled={loading}
            style={{
              background: C.surf2,
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              padding: '10px 16px',
              color: C.text,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ← Volver
          </button>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: accent,
            }}
          >
            {isPickup ? '📦 TIENDA' : '🏠 DESTINO'}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <div
            style={{
              fontFamily: C.fontDisplay,
              fontSize: 22,
              fontWeight: 700,
              color: C.text,
              marginBottom: 4,
            }}
          >
            {title} #{orderNumber}
          </div>
          <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        </div>

        {/* Cajas de dígitos del PIN */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: 8,
            width: '100%',
            maxWidth: 360,
            margin: '28px auto 10px',
          }}
        >
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const digit = pin[index];
            const isFilled = digit !== undefined;
            return (
              <div
                key={index}
                style={{
                  height: 68,
                  borderRadius: 16,
                  background: isFilled ? 'rgba(198, 65, 12, 0.08)' : C.surf1,
                  border: isFilled
                    ? `2px solid ${accent}`
                    : `1px solid ${C.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: C.fontDisplay,
                  color: accent,
                  boxShadow: isFilled ? '0 0 20px rgba(198, 65, 12, 0.14)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              >
                {isFilled ? digit : ''}
              </div>
            );
          })}
        </div>

        {errorMsg && (
          <div
            style={{
              textAlign: 'center',
              color: C.coral,
              fontSize: 12,
              fontWeight: 700,
              marginTop: 6,
            }}
          >
            ⚠️ {errorMsg}
          </div>
        )}
      </div>

      {/* Teclado numérico outdoor (64px targets para uso con guante) */}
      <div style={{ width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12,
            marginBottom: 16,
          }}
        >
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'].map((item) => {
            const isAction = item === 'C' || item === '⌫';
            return (
              <button
                key={item}
                disabled={loading}
                onClick={() => {
                  if (item === 'C') handleClear();
                  else if (item === '⌫') handleDelete();
                  else handleDigit(item);
                }}
                style={{
                  height: 64,
                  borderRadius: 18,
                  background: isAction ? C.surf2 : C.surf1,
                  border: `1px solid ${C.border}`,
                  color: isAction ? C.textDim : C.text,
                  fontSize: isAction ? 16 : 24,
                  fontWeight: 700,
                  fontFamily: isAction ? C.fontBody : C.fontDisplay,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  touchAction: 'manipulation',
                }}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Botón de confirmación */}
        <button
          onClick={handleSubmit}
          disabled={!isPinValid || loading}
          style={{
            width: '100%',
            height: 64,
            borderRadius: 20,
            background: isPinValid ? accent : C.surf3,
            border: 'none',
            color: isPinValid ? '#fff' : C.textMuted,
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: isPinValid && !loading ? 'pointer' : 'not-allowed',
            boxShadow:
              isPinValid
                ? `0 10px 30px ${isPickup ? 'rgba(198, 65, 12, 0.25)' : 'rgba(20, 116, 59, 0.25)'}`
                : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          {loading ? 'VALIDANDO...' : isPickup ? 'VERIFICAR RECOLECCIÓN' : 'VERIFICAR ENTREGA'}
        </button>
      </div>
    </div>
  );
}
