'use client';
import React, { useState, useRef, useEffect } from 'react';
import { C, S } from '@/lib/tokens';

interface DeliveryEvidenceModalProps {
  orderId: string;
  onClose: () => void;
  onSubmit: (evidence: { photoBase64?: string; signatureBase64?: string }) => void;
}

export function DeliveryEvidenceModal({ orderId, onClose, onSubmit }: DeliveryEvidenceModalProps) {
  const [step, setStep] = useState<'photo' | 'signature' | 'preview'>('photo');
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [signatureBase64, setSignatureBase64] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Photo capture
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

        // Resize to 400x300 max and compress
        let width = img.width;
        let height = img.height;
        const maxWidth = 400;
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
        setStep('signature');
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  // Signature drawing
  useEffect(() => {
    if (step !== 'signature' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const container = canvas.parentElement;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    ctx.fillStyle = C.surf1;
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [step]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (step !== 'signature' || !canvasRef.current) return;
    setIsDrawing(true);

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let x = 0;
    let y = 0;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || step !== 'signature' || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let x = 0;
    let y = 0;

    if ('touches' in e) {
      x = e.touches[0].clientX - rect.left;
      y = e.touches[0].clientY - rect.top;
    } else {
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = C.surf1;
    ctx.fillRect(0, 0, rect.width, rect.height);
  };

  const confirmSignature = () => {
    if (!canvasRef.current) return;
    const sig = canvasRef.current.toDataURL('image/png');
    setSignatureBase64(sig);
    setStep('preview');
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 50,
      display: 'flex', alignItems: 'flex-end'
    }} onClick={onClose}>
      <div style={{
        background: C.bg, borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh',
        overflow: 'auto', padding: '20px', paddingBottom: '40px'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: 0 }}>
            Evidencia de Entrega
          </h2>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: C.textDim, cursor: 'pointer', fontSize: 24
          }}>×</button>
        </div>

        {step === 'photo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
              Captura una foto del comprobante de entrega
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                minHeight: 56, padding: '16px', borderRadius: 16, border: 'none',
                background: C.amber, color: '#0C0C0E', fontSize: 14, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
              </svg>
              Capturar Foto
            </button>
            <button
              onClick={() => setStep('signature')}
              style={{
                minHeight: 56, padding: '16px', borderRadius: 16, border: `1px solid ${C.border}`,
                background: 'transparent', color: C.text, fontSize: 14, fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Omitir Foto
            </button>
          </div>
        )}

        {step === 'signature' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: C.textDim, margin: 0 }}>
              Firma digital del cliente
            </p>
            <div style={{
              background: C.surf1, border: `2px solid ${C.border}`, borderRadius: 12, overflow: 'hidden',
              aspectRatio: '16 / 9', minHeight: 200
            }}>
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
                style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={clearSignature}
                style={{
                  flex: 1, minHeight: 56, borderRadius: 12, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.textDim, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Limpiar
              </button>
              <button
                onClick={confirmSignature}
                style={{
                  flex: 1, minHeight: 56, borderRadius: 12, border: 'none',
                  background: C.green, color: '#0C0C0E', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 13, color: C.textDim }}>Resumen de evidencia</div>

            {photoBase64 && (
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Foto de comprobante
                </div>
                <img
                  src={photoBase64}
                  alt="Comprobante"
                  style={{ width: '100%', borderRadius: 12, maxHeight: 200, objectFit: 'cover' }}
                />
              </div>
            )}

            {signatureBase64 && (
              <div>
                <div style={{ fontSize: 11, color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                  Firma digital
                </div>
                <img
                  src={signatureBase64}
                  alt="Firma"
                  style={{ width: '100%', borderRadius: 12, background: C.surf1, padding: 8 }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button
                onClick={() => setStep('signature')}
                style={{
                  flex: 1, minHeight: 56, borderRadius: 12, border: `1px solid ${C.border}`,
                  background: 'transparent', color: C.text, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Volver
              </button>
              <button
                onClick={() => onSubmit({ photoBase64, signatureBase64 })}
                style={{
                  flex: 1, minHeight: 56, borderRadius: 12, border: 'none',
                  background: C.green, color: '#0C0C0E', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Enviar Evidencia
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
