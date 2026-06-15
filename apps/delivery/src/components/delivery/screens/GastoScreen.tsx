'use client';
// handoff/screens/GastoScreen.tsx
import React, { useState } from 'react';
import { C, S } from '@/lib/tokens';

interface GastoScreenProps {
  onBack: () => void;
  onSave: (category: string, amount: string, description: string) => void;
}

// Categorías canónicas — alineadas al catálogo de gastos (OperatingExpenseCategory)
// para que repartidor, turno y reportes hablen el mismo idioma. Sin default: el
// repartidor DEBE elegir (antes caía siempre en GASOLINA por estar preseleccionada,
// y las compras de insumos salían mal clasificadas).
const CATS = [
  { value: 'GASOLINA',      label: 'Gasolina',          color: '#FFB84D' },
  { value: 'COMPRAS',       label: 'Compras / Insumos', color: '#88D66C' },
  { value: 'MANTENIMIENTO', label: 'Mantenimiento',     color: '#A78BFA' },
  { value: 'CASETAS',       label: 'Casetas / Peaje',   color: '#60A5FA' },
  { value: 'OTROS',         label: 'Otro gasto',        color: 'rgba(255,255,255,0.4)' },
];

export function GastoScreen({ onBack, onSave }: GastoScreenProps) {
  const [cat, setCat]     = useState('');
  const [amount, setAmount] = useState('');
  const [desc, setDesc]   = useState('');

  return (
    <div style={{ minHeight: '100vh', background: C.bg, fontFamily: C.fontBody }}>
      <div style={S.header}>
        <button onClick={onBack} style={S.iconBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.text }}>Registrar Gasto</div>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 40 }}>

        {/* Categoría */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Categoría</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CATS.map(c => {
              const active = cat === c.value;
              const softBg = c.color + '18';
              const border  = active ? c.color + '45' : C.border;
              return (
                <button key={c.value} onClick={() => setCat(c.value)} style={{
                  height: 52, borderRadius: 14, cursor: 'pointer',
                  border: `1px solid ${border}`,
                  background: active ? softBg : C.surf2,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0 16px', color: active ? c.color : C.textDim,
                  fontSize: 13, fontWeight: 600, fontFamily: C.fontBody, transition: 'all 0.15s',
                }}>
                  <span>{c.label}</span>
                  {active && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Monto */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Monto</div>
          <div style={{ position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
              fontFamily: C.fontDisplay, fontSize: 26, fontWeight: 700,
              color: amount ? C.amber : 'rgba(255,184,77,0.28)', pointerEvents: 'none',
            }}>$</span>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" style={{
                width: '100%', height: 64, background: C.bg,
                border: `1px solid ${amount ? 'rgba(255,184,77,0.4)' : C.border}`,
                borderRadius: 14, paddingLeft: 38, paddingRight: 16,
                fontFamily: C.fontDisplay, fontSize: 30, fontWeight: 700,
                color: C.text, outline: 'none', letterSpacing: '-0.02em',
              }} />
          </div>
        </div>

        {/* Descripción */}
        <div style={S.card}>
          <div style={S.sectionLabel}>Descripción</div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)}
            placeholder="Ej. Recarga en gasolinera Pemex…"
            style={{
              width: '100%', minHeight: 88, background: C.bg,
              border: `1px solid ${C.border}`, borderRadius: 14,
              padding: '12px 14px', resize: 'none',
              fontSize: 13, color: C.text, fontFamily: C.fontBody, outline: 'none',
            }} />
        </div>

        {/* Guardar */}
        <button
          onClick={() => amount && cat && onSave(cat, amount, desc)}
          disabled={!amount || !cat}
          style={{
            ...S.btnPrimary,
            background: (amount && cat) ? C.amber : C.amberSoft,
            color: (amount && cat) ? '#090909' : 'rgba(255,184,77,0.35)',
            boxShadow: (amount && cat) ? '0 16px 48px rgba(255,184,77,0.28)' : 'none',
          }}
        >{!cat ? 'ELIGE UNA CATEGORÍA' : 'GUARDAR MOVIMIENTO'}</button>
      </div>
    </div>
  );
}
