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
        background: 'rgba(9, 9, 11, 0.96)',
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
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 12,
              padding: '10px 16px',
              color: '#fff',
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
              color: isPickup ? C.amber : C.green,
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
              color: '#fff',
              marginBottom: 4,
            }}
          >
            {title} #{orderNumber}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.4 }}>
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
                  background: isFilled ? 'rgba(255, 184, 77, 0.12)' : 'rgba(255, 255, 255, 0.04)',
                  border: isFilled
                    ? `2px solid ${isPickup ? C.amber : C.green}`
                    : '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 28,
                  fontWeight: 700,
                  fontFamily: C.fontDisplay,
                  color: isPickup ? C.amber : C.green,
                  boxShadow: isFilled ? '0 0 20px rgba(255, 184, 77, 0.2)' : 'none',
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
                  background: isAction ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: isAction ? 'rgba(255, 255, 255, 0.7)' : '#fff',
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
            background: isPinValid ? (isPickup ? C.amber : C.green) : 'rgba(255, 255, 255, 0.1)',
            border: 'none',
            color: isPinValid ? '#090909' : 'rgba(255, 255, 255, 0.3)',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            cursor: isPinValid && !loading ? 'pointer' : 'not-allowed',
            boxShadow:
              isPinValid
                ? `0 10px 30px ${isPickup ? 'rgba(255, 184, 77, 0.35)' : 'rgba(136, 214, 108, 0.35)'}`
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
