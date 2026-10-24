'use client';
import React, { useState, useRef } from 'react';
import { C, S } from '@/lib/tokens';
import { useOfflineStore } from '@/store/useOfflineStore';

interface DeliveryIncidentModalProps {
  orderId: string;
  taskId: string;
  courierId: string;
  onClose: () => void;
  onSubmit?: () => void;
}

type IncidentType = 'CUSTOMER_UNREACHABLE' | 'WRONG_ADDRESS' | 'DAMAGED_OR_REJECTED' | null;

interface IncidentData {
  type: IncidentType;
  timestamp: number;
  callAttempts: number;
  notes: string;
  photo?: string;
}

export function DeliveryIncidentModal({
  orderId,
  taskId,
  courierId,
  onClose,
  onSubmit,
}: DeliveryIncidentModalProps) {
  const [step, setStep] = useState<'select' | 'details' | 'confirm'>('select');
  const [incidentType, setIncidentType] = useState<IncidentType>(null);
  const [callAttempts, setCallAttempts] = useState(1);
  const [notes, setNotes] = useState('');
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const offlineStore = useOfflineStore();

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (typeof result !== 'string') return;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = img.width;
        let height = img.height;
        const maxWidth = 300;
        const maxHeight = 300;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL('image/jpeg', 0.7);
        setPhotoBase64(compressed);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectIncident = (type: IncidentType) => {
    setIncidentType(type);
    setStep('details');
  };

  const handleSubmitIncident = () => {
    if (!incidentType) return;

    try {
      const incidentData: IncidentData = {
        type: incidentType,
        timestamp: Date.now(),
        callAttempts:
          incidentType === 'CUSTOMER_UNREACHABLE' ? callAttempts : 0,
        notes,
        photo: photoBase64 || undefined,
      };

      // Queue the incident in offline store
      const txId = offlineStore.addToQueue({
        type: 'DELIVERY_INCIDENT',
        data: {
          orderId,
          taskId,
          courierId,
          incident: incidentData,
        },
      });

      setStep('confirm');
    } catch (err) {
      console.error('Error queueing incident:', err);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: C.bg,
          borderRadius: '20px 20px 0 0',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          padding: '20px',
          paddingBottom: '40px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
          }}
        >
          <h2
            style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}
          >
            Reportar Incidencia
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: C.textDim,
              cursor: 'pointer',
              fontSize: 24,
            }}
          >
            ×
          </button>
        </div>

        {step === 'select' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => handleSelectIncident('CUSTOMER_UNREACHABLE')}
              style={{
                minHeight: 56,
                padding: '16px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.coralSoft,
                color: C.coral,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="20"
                height="20"
              >
                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.4 9.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012.32 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 9.91a16 16 0 006.29 6.29l1.28-1.28a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
              </svg>
              <span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Cliente no contesta
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                  Registro de llamadas fallidas
                </div>
              </span>
            </button>

            <button
              onClick={() => handleSelectIncident('WRONG_ADDRESS')}
              style={{
                minHeight: 56,
                padding: '16px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.warnSoft,
                color: C.warn,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="20"
                height="20"
              >
                <path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Dirección errónea
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                  Ubicación no coincide
                </div>
              </span>
            </button>

            <button
              onClick={() => handleSelectIncident('DAMAGED_OR_REJECTED')}
              style={{
                minHeight: 56,
                padding: '16px',
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: 'rgba(255, 101, 80, 0.12)',
                color: '#FF6550',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                width="20"
                height="20"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                <path d="M13 7h-2v5h2V7zm0 6h-2v2h2v-2z" />
              </svg>
              <span>
                <div style={{ fontSize: 14, fontWeight: 700 }}>
                  Producto dañado/rechazado
                </div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                  Daño o rechazo del cliente
                </div>
              </span>
            </button>
          </div>
        )}

        {step === 'details' && incidentType === 'CUSTOMER_UNREACHABLE' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Intentos de llamada
              </label>
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <button
                  onClick={() => setCallAttempts(Math.max(1, callAttempts - 1))}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.surf1,
                    color: C.text,
                    fontSize: 20,
                    cursor: 'pointer',
                  }}
                >
                  −
                </button>
                <div
                  style={{
                    flex: 1,
                    height: 56,
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.surf1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    fontWeight: 700,
                    color: C.text,
                  }}
                >
                  {callAttempts}
                </div>
                <button
                  onClick={() => setCallAttempts(Math.min(10, callAttempts + 1))}
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    border: `1px solid ${C.border}`,
                    background: C.surf1,
                    color: C.text,
                    fontSize: 20,
                    cursor: 'pointer',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Notas (opcional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalles adicionales..."
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.surf1,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: C.fontBody,
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              onClick={() => handleSubmitIncident()}
              style={{
                minHeight: 56,
                borderRadius: 12,
                border: 'none',
                background: C.coral,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Reportar
            </button>
          </div>
        )}

        {step === 'details' && incidentType === 'WRONG_ADDRESS' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Detalles de la dirección
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe la ubicación correcta o qué está incorrecto..."
                style={{
                  width: '100%',
                  minHeight: 120,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.surf1,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: C.fontBody,
                  resize: 'vertical',
                }}
              />
            </div>

            <button
              onClick={() => handleSubmitIncident()}
              style={{
                minHeight: 56,
                borderRadius: 12,
                border: 'none',
                background: C.warn,
                color: '#000',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Reportar
            </button>
          </div>
        )}

        {step === 'details' && incidentType === 'DAMAGED_OR_REJECTED' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Motivo del daño/rechazo
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe qué está dañado o por qué fue rechazado..."
                style={{
                  width: '100%',
                  minHeight: 100,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${C.border}`,
                  background: C.surf1,
                  color: C.text,
                  fontSize: 13,
                  fontFamily: C.fontBody,
                  resize: 'vertical',
                }}
              />
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 700,
                  color: C.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Foto de evidencia (opcional)
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhotoCapture}
                style={{ display: 'none' }}
              />
              {!photoBase64 && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    width: '100%',
                    minHeight: 56,
                    borderRadius: 12,
                    border: `1px dashed ${C.border}`,
                    background: 'transparent',
                    color: C.textDim,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    width="16"
                    height="16"
                  >
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                  Adjuntar foto
                </button>
              )}
              {photoBase64 && (
                <div style={{ position: 'relative' }}>
                  <img
                    src={photoBase64}
                    alt="Evidencia"
                    style={{
                      width: '100%',
                      borderRadius: 12,
                      maxHeight: 150,
                      objectFit: 'cover',
                    }}
                  />
                  <button
                    onClick={() => setPhotoBase64('')}
                    style={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      border: 'none',
                      background: 'rgba(0,0,0,0.6)',
                      color: '#fff',
                      cursor: 'pointer',
                      fontSize: 16,
                    }}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => handleSubmitIncident()}
              style={{
                minHeight: 56,
                borderRadius: 12,
                border: 'none',
                background: '#FF6550',
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Reportar
            </button>
          </div>
        )}

        {step === 'confirm' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.green}
              strokeWidth="2"
              width="64"
              height="64"
              style={{ margin: '0 auto' }}
            >
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: C.text,
                  margin: '0 0 8px 0',
                }}
              >
                Incidencia reportada
              </h3>
              <p
                style={{ fontSize: 12, color: C.textDim, margin: 0 }}
              >
                Se sincronizará cuando tengas conexión
              </p>
            </div>
            <button
              onClick={() => {
                onSubmit?.();
                onClose();
              }}
              style={{
                minHeight: 56,
                borderRadius: 12,
                border: 'none',
                background: C.green,
                color: '#0C0C0E',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                marginTop: 8,
              }}
            >
              Continuar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
