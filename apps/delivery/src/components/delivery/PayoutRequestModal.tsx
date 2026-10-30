'use client';
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface PayoutRequestModalProps {
  isOpen: boolean;
  driverId: string;
  availableBalance: number;
  pendingCashInHand: number;
  onClose: () => void;
  onSubmit: (data: {
    amount: number;
    bankAccount: string;
    accountType: 'CLABE' | 'DEBIT';
  }) => Promise<void>;
}

export function PayoutRequestModal({
  isOpen,
  driverId,
  availableBalance,
  pendingCashInHand,
  onClose,
  onSubmit,
}: PayoutRequestModalProps) {
  const [amount, setAmount] = useState('');
  const [accountType, setAccountType] = useState<'CLABE' | 'DEBIT'>('CLABE');
  const [bankAccount, setBankAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amountNum = Number(amount);
  const isValidAmount = Number.isFinite(amountNum) && amountNum > 0 && amountNum <= availableBalance;
  const isValidClabe = accountType === 'CLABE' ? bankAccount.replace(/\D/g, '').length === 18 : bankAccount.length > 0;
  const canSubmit = isValidAmount && isValidClabe && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;

    setError('');
    setBusy(true);
    try {
      const clabeNumber = bankAccount.replace(/\D/g, '');
      await onSubmit({
        amount: amountNum,
        bankAccount: clabeNumber,
        accountType,
      });
      setAmount('');
      setBankAccount('');
      setAccountType('CLABE');
    } catch (err: any) {
      setError(err?.message || 'Error al procesar solicitud');
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalCard} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: C.fontDisplay, fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 4 }}>
          Solicitar Retiro
        </div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18, lineHeight: 1.5 }}>
          Saldo disponible: <strong style={{ color: C.green }}>${availableBalance.toFixed(2)}</strong>
        </div>

        {/* Advertencia de efectivo en mano */}
        {pendingCashInHand > 0 && (
          <div style={{
            background: C.coralSoft, border: `1px solid ${C.coral}40`,
            borderRadius: 14, padding: '12px 14px', marginBottom: 18, fontSize: 12, color: C.text,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: C.coral }}>⚠ Efectivo en mano pendiente</div>
            <div style={{ fontSize: 11, color: C.textDim }}>
              Tienes ${pendingCashInHand.toFixed(2)} en efectivo que debe entregarse en caja antes de hacer un retiro bancario.
            </div>
          </div>
        )}

        {/* Monto a retirar */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Monto a retirar
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              fontFamily: C.fontDisplay, fontSize: 24, fontWeight: 700,
              color: amount ? C.green : 'rgba(136,214,108,0.3)', pointerEvents: 'none',
            }}>$</span>
            <input type="number" inputMode="decimal" autoFocus value={amount}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              placeholder="0.00"
              style={{
                width: '100%', height: 60, background: C.bg,
                border: `1px solid ${amount && isValidAmount ? 'rgba(136,214,108,0.4)' : amount && !isValidAmount ? 'rgba(255,92,51,0.4)' : C.border}`,
                borderRadius: 14, paddingLeft: 36, paddingRight: 16,
                fontFamily: C.fontDisplay, fontSize: 28, fontWeight: 700,
                color: C.text, outline: 'none', letterSpacing: '-0.02em', boxSizing: 'border-box',
              }} />
          </div>
          {amount && !isValidAmount && (
            <div style={{ fontSize: 10, color: C.coral, marginTop: 6 }}>
              {amountNum <= 0 ? 'Ingresa un monto válido' : `Máximo ${availableBalance.toFixed(2)}`}
            </div>
          )}
        </div>

        {/* Tipo de cuenta */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            Tipo de cuenta
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['CLABE', 'DEBIT'] as const).map(type => (
              <button key={type}
                onClick={() => { setAccountType(type); setBankAccount(''); setError(''); }}
                style={{
                  flex: 1, height: 48, borderRadius: 12, border: `1px solid ${accountType === type ? C.iris : C.border}`,
                  background: accountType === type ? C.irisSoft : 'transparent',
                  color: accountType === type ? C.iris : C.textMuted,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: C.fontBody,
                  transition: 'all 0.2s',
                }}>
                {type === 'CLABE' ? 'Cuenta CLABE' : 'Débito'}
              </button>
            ))}
          </div>
        </div>

        {/* Número de cuenta */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
            {accountType === 'CLABE' ? 'CLABE (18 dígitos)' : 'Número de débito'}
          </label>
          <input type="text" inputMode="numeric" value={bankAccount}
            onChange={e => { setBankAccount(e.target.value); setError(''); }}
            placeholder={accountType === 'CLABE' ? '000 000 000 000 000 000' : '1234 5678 9012 3456'}
            style={{
              width: '100%', height: 48, background: C.bg,
              border: `1px solid ${bankAccount && !isValidClabe ? 'rgba(255,92,51,0.4)' : bankAccount && isValidClabe ? 'rgba(167,139,250,0.4)' : C.border}`,
              borderRadius: 12, paddingInline: 14,
              fontSize: 14, fontWeight: 600, color: C.text, fontFamily: C.fontBody,
              outline: 'none', boxSizing: 'border-box', letterSpacing: '0.05em',
            }} />
          {bankAccount && !isValidClabe && (
            <div style={{ fontSize: 10, color: C.coral, marginTop: 6 }}>
              {accountType === 'CLABE' ? 'CLABE debe tener 18 dígitos' : 'Ingresa un número válido'}
            </div>
          )}
        </div>

        {/* Error general */}
        {error && (
          <div style={{
            background: C.coralSoft, border: `1px solid ${C.coral}40`,
            borderRadius: 12, padding: '10px 12px', marginBottom: 18, fontSize: 11, color: C.coral,
          }}>
            {error}
          </div>
        )}

        {/* Botones */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={busy} style={{
            ...modalBtnGhost,
            opacity: busy ? 0.5 : 1,
          }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={!canSubmit} style={{
            ...modalBtnSolid,
            background: canSubmit ? C.green : C.greenSoft,
            color: canSubmit ? '#090909' : 'rgba(136,214,108,0.4)',
            opacity: !canSubmit && !busy ? 0.6 : 1,
          }}>
            {busy ? '...' : 'Solicitar retiro'}
          </button>
        </div>
      </div>
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
